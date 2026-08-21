import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { and, count, eq, gt, isNull } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service.js';
import { sessions, users, voiceProfiles } from '../db/schema.js';
import { QuotaService } from '../quota/quota.service.js';
import type { AuthenticatedUser } from './auth.types.js';
import { WechatCodeExchanger } from './wechat-code-exchanger.js';

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function publicUser(row: typeof users.$inferSelect): AuthenticatedUser {
  return {
    id: row.id,
    openid: row.openid,
    unionid: row.unionid,
    nickname: row.nickname,
    avatarUrl: row.avatarUrl,
  };
}

function trialEligibility(row: typeof users.$inferSelect): 'ELIGIBLE' | 'GRANTED' | 'USED' {
  return row.trialCustomGenerationConsumedAt
    ? 'USED'
    : row.trialCustomGenerationGrantedAt
      ? 'GRANTED'
      : 'ELIGIBLE';
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
    @Inject(WechatCodeExchanger)
    private readonly exchanger: WechatCodeExchanger,
  ) {}

  async login(input: { code: string; profile?: { nickname?: string; avatarUrl?: string } }): Promise<{
    token: string;
    user: AuthenticatedUser;
    trialEligibility: 'ELIGIBLE' | 'GRANTED' | 'USED';
    points: Awaited<ReturnType<QuotaService['getPoints']>>;
  }> {
    const code = input.code.trim();
    if (!code) throw new UnauthorizedException('WeChat login code is required');
    const wechat = await this.exchanger.exchange(code);
    const now = new Date();
    const nickname = String(input.profile?.nickname || '').trim().slice(0, 40);
    const avatarUrl = String(input.profile?.avatarUrl || '').trim().slice(0, 500);

    const [user] = await this.database.db
      .insert(users)
      .values({
        openid: wechat.openid,
        unionid: wechat.unionid || null,
        nickname,
        avatarUrl,
      })
      .onConflictDoUpdate({
        target: users.openid,
        set: {
          ...(wechat.unionid ? { unionid: wechat.unionid } : {}),
          ...(nickname ? { nickname } : {}),
          ...(avatarUrl ? { avatarUrl } : {}),
          updatedAt: now,
        },
      })
      .returning();

    const points = await new QuotaService(this.database).ensureSignupGrant(user.id);
    const token = randomBytes(32).toString('base64url');
    const ttlDays = Math.max(1, Number(process.env.SESSION_TTL_DAYS || 30));
    await this.database.db.insert(sessions).values({
      userId: user.id,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + ttlDays * 86_400_000),
    });

    return {
      token,
      user: publicUser(user),
      trialEligibility: trialEligibility(user),
      points,
    };
  }

  async me(userId: string) {
    const user = await this.database.db.query.users.findFirst({
      where: and(eq(users.id, userId), isNull(users.deletedAt)),
    });
    if (!user) throw new UnauthorizedException('user not found');
    const [voiceCount] = await this.database.db
      .select({ value: count() })
      .from(voiceProfiles)
      .where(and(eq(voiceProfiles.userId, userId), isNull(voiceProfiles.deletedAt)));
    return {
      user: publicUser(user),
      trialEligibility: trialEligibility(user),
      voiceCount: Number(voiceCount?.value || 0),
      points: await new QuotaService(this.database).getPoints(userId),
    };
  }

  async updateProfile(userId: string, input: { nickname?: string; avatarUrl?: string }) {
    const nickname = input.nickname === undefined ? undefined : input.nickname.trim().slice(0, 40);
    const avatarUrl = input.avatarUrl === undefined ? undefined : input.avatarUrl.trim().slice(0, 500);
    const [user] = await this.database.db.update(users).set({
      ...(nickname !== undefined ? { nickname } : {}),
      ...(avatarUrl !== undefined ? { avatarUrl } : {}),
      updatedAt: new Date(),
    }).where(and(eq(users.id, userId), isNull(users.deletedAt))).returning();
    if (!user) throw new UnauthorizedException('user not found');
    return { user: publicUser(user) };
  }

  async authenticate(rawToken: string): Promise<AuthenticatedUser | null> {
    if (!rawToken) return null;
    const rows = await this.database.db
      .select({ user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(
        eq(sessions.tokenHash, tokenHash(rawToken)),
        gt(sessions.expiresAt, new Date()),
        isNull(sessions.revokedAt),
        isNull(users.deletedAt),
      ))
      .limit(1);
    return rows[0] ? publicUser(rows[0].user) : null;
  }

  async revoke(rawToken: string): Promise<void> {
    if (!rawToken) return;
    await this.database.db
      .update(sessions)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(sessions.tokenHash, tokenHash(rawToken)));
  }
}
