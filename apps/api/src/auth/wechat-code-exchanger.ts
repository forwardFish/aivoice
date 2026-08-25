import { BadGatewayException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { WechatServerSessionResult, WechatSessionResult } from './auth.types.js';

@Injectable()
export class WechatCodeExchanger {
  async exchange(code: string): Promise<WechatSessionResult> {
    const result = await this.exchangeWithSession(code);
    return { openid: result.openid, unionid: result.unionid };
  }

  async exchangeWithSession(code: string): Promise<WechatServerSessionResult> {
    if (process.env.WECHAT_MOCK_LOGIN === 'true') {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('WECHAT_MOCK_LOGIN is forbidden in production');
      }
      const mockOpenid = code.startsWith('mock:') ? code.slice(5).trim() : '';
      if (!mockOpenid) throw new UnauthorizedException('mock login code must use mock:<openid>');
      return { openid: mockOpenid, sessionKey: `mock-session-${mockOpenid}` };
    }

    const appid = process.env.WECHAT_APP_ID?.trim();
    const secret = process.env.WECHAT_APP_SECRET?.trim();
    if (!appid || !secret) throw new Error('WECHAT_APP_ID/WECHAT_APP_SECRET is not configured');
    const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
    url.searchParams.set('appid', appid);
    url.searchParams.set('secret', secret);
    url.searchParams.set('js_code', code);
    url.searchParams.set('grant_type', 'authorization_code');

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    } catch {
      throw new BadGatewayException('WeChat code2Session network request failed');
    }
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw new BadGatewayException(`WeChat code2Session HTTP ${response.status}`);
    if (data.errcode) throw new UnauthorizedException(`WeChat code2Session failed: ${String(data.errcode)}`);
    const openid = String(data.openid || '').trim();
    const sessionKey = String(data.session_key || '').trim();
    if (!openid) throw new BadGatewayException('WeChat code2Session response missing openid');
    if (!sessionKey) throw new BadGatewayException('WeChat code2Session response missing session_key');
    return { openid, unionid: String(data.unionid || '').trim() || undefined, sessionKey };
  }
}
