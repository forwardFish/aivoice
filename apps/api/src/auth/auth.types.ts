export interface AuthenticatedUser {
  id: string;
  openid: string;
  unionid: string | null;
  nickname: string;
  avatarUrl: string;
}

export interface WechatSessionResult {
  openid: string;
  unionid?: string;
}
