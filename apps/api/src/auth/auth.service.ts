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

  async login(
    input: { code?: string; profile?: { nickname?: string; avatarUrl?: string } },
    platformIdentity: { openid?: string; appid?: string } = {},
  ): Promise<{
    token: string;
    user: AuthenticatedUser;
    trialEligibility: 'ELIGIBLE' | 'GRANTED' | 'USED';
    points: Awaited<ReturnType<QuotaService['getPoints']>>;
  }> {
    const platformOpenid = String(platformIdentity.openid || '').trim();
    const platformAppid = String(platformIdentity.appid || '').trim();
    const expectedAppid = String(process.env.WECHAT_APP_ID || '').trim();
    if (platformOpenid && (!platformAppid || (expectedAppid && platformAppid !== expectedAppid))) {
      throw new UnauthorizedException('CloudBase platform identity does not match this mini-program');
    }
    const code = String(input.code || '').trim();
    if (!platformOpenid && !code) throw new UnauthorizedException('WeChat login code is required');
    const wechat = platformOpenid
      ? { openid: platformOpenid, unionid: '' }
      : await this.exchanger.exchange(code);
    const now = new Date();
    const nickname = String(input.profile?.nickname || '').trim().slice(0, 40);
    const avatarUrl = String(input.profile?.avatarUrl || '').trim().slice(0, 500);

    if (this.database.isCloudBase) {
      const cloud = this.database.requireCloud();
      const loginResult = await cloud.rpc<{
        user: typeof users.$inferSelect;
      }>('rpc_auth_login_wechat', {
        pOpenid: wechat.openid,
        pUnionid: wechat.unionid || null,
        pNickname: nickname,
        pAvatarUrl: avatarUrl,
        pSignupBonusPoints: Number(process.env.SIGNUP_BONUS_POINTS || 10),
      });
      const user = loginResult.user;
      if (!user) throw new UnauthorizedException('user not found');
      const token = randomBytes(32).toString('base64url');
      const ttlDays = Math.max(1, Number(process.env.SESSION_TTL_DAYS || 30));
      await cloud.rpc('rpc_auth_issue_session', {
        pUserId: user.id,
        pTokenHash: tokenHash(token),
        pExpiresAt: new Date(Date.now() + ttlDays * 86_400_000).toISOString(),
      });
      return {
        token,
        user: publicUser(user),
        trialEligibility: trialEligibility(user),
        points: await new QuotaService(this.database).getPoints(user.id),
      };
    }

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
    if (this.database.isCloudBase) {
      const cloud = this.database.requireCloud();
      const user = await cloud.selectOne<typeof users.$inferSelect>('users', {
        filters: { id: userId, deletedAt: { is: null } },
      });
      if (!user) throw new UnauthorizedException('user not found');
      const voices = await cloud.select<{ id: string }>('voice_profiles', {
        select: 'id',
        filters: { userId, deletedAt: { is: null } },
      });
      return {
        user: publicUser(user),
        trialEligibility: trialEligibility(user),
        voiceCount: voices.length,
        points: await new QuotaService(this.database).getPoints(userId),
      };
    }
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
    if (this.database.isCloudBase) {
      const [user] = await this.database.requireCloud().update<typeof users.$inferSelect>('users', {
        ...(nickname !== undefined ? { nickname } : {}),
        ...(avatarUrl !== undefined ? { avatarUrl } : {}),
        updatedAt: new Date().toISOString(),
      }, { filters: { id: userId, deletedAt: { is: null } } });
      if (!user) throw new UnauthorizedException('user not found');
      return { user: publicUser(user) };
    }
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
    if (this.database.isCloudBase) {
      const cloud = this.database.requireCloud();
      const session = await cloud.selectOne<{ userId: string }>('sessions', {
        select: 'user_id',
        filters: {
          tokenHash: tokenHash(rawToken),
          expiresAt: { gt: new Date().toISOString() },
          revokedAt: { is: null },
        },
      });
      if (!session) return null;
      const user = await cloud.selectOne<typeof users.$inferSelect>('users', {
        filters: { id: session.userId, deletedAt: { is: null } },
      });
      return user ? publicUser(user) : null;
    }
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
    if (this.database.isCloudBase) {
      await this.database.requireCloud().rpc('rpc_auth_revoke_session', {
        pTokenHash: tokenHash(rawToken),
      });
      return;
    }
    await this.database.db
      .update(sessions)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(sessions.tokenHash, tokenHash(rawToken)));
  }
}
