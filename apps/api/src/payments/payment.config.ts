import fs from 'node:fs';
import path from 'node:path';

function readSecretFile(filePath: string | undefined): string {
  const value = String(filePath || '').trim();
  if (!value) return '';
  const resolved = path.resolve(value);
  return fs.existsSync(resolved) ? fs.readFileSync(resolved, 'utf8') : '';
}

export interface WechatPayConfig {
  appId: string;
  mchId: string;
  serialNo: string;
  privateKey: string;
  merchantCert: string;
  apiV3Key: string;
  platformCert: string;
  notifyUrl: string;
  description: string;
}

export function loadWechatPayConfig(): WechatPayConfig {
  return {
    appId: process.env.WECHAT_APP_ID?.trim() || '',
    mchId: process.env.WECHAT_PAY_MCH_ID?.trim() || '',
    serialNo: process.env.WECHAT_PAY_SERIAL_NO?.trim() || '',
    privateKey: process.env.WECHAT_PAY_PRIVATE_KEY || readSecretFile(process.env.WECHAT_PAY_PRIVATE_KEY_PATH),
    merchantCert: process.env.WECHAT_PAY_MERCHANT_CERT || readSecretFile(process.env.WECHAT_PAY_MERCHANT_CERT_PATH),
    apiV3Key: process.env.WECHAT_PAY_API_V3_KEY?.trim() || '',
    platformCert: process.env.WECHAT_PAY_PLATFORM_CERT || readSecretFile(process.env.WECHAT_PAY_PLATFORM_CERT_PATH),
    notifyUrl: process.env.WECHAT_PAY_NOTIFY_URL?.trim() || '',
    description: process.env.WECHAT_PAY_DESCRIPTION?.trim() || '那时的TA-50积分语音生成',
  };
}
