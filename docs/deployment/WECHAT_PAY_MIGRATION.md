# WeChat Pay migration status

Updated: 2026-08-23

## Migrated securely from the reference project

- Merchant id: migrated and verified to match the linked ordinary merchant.
- Merchant API certificate serial: migrated and verified against the certificate.
- Merchant API private key and certificate: copied outside the repository to `D:\lyh\secrets\aivoice\wechat-pay\`.
- Private key/certificate match: verified by RSA sign/verify and public-key comparison.
- Merchant certificate validity: verified as currently valid.
- APIv3 key: migrated without printing it; length verified as 32 characters.
- Payment description: changed to `那年的TA-50积分包`.
- New mini-program AppID: configured.

## Deliberately not copied

- The reference mini-program AppID.
- The reference mini-program AppSecret.
- The reference project's payment callback URL (`/api/pay/notify`).

These values belong to the old application or backend and must not be reused.

## Still required before real payment

1. In Merchant Platform -> Account Center -> API Security, download the current WeChat Pay public key and copy its public-key id. Configure `WECHAT_PAY_PUBLIC_KEY_PATH` and `WECHAT_PAY_PUBLIC_KEY_ID`.
   - A signed `/v3/certificates` request returned HTTP 406, so the merchant likely uses WeChat Pay public-key mode instead of platform-certificate mode.
   - The API now supports both public-key and platform-certificate notification verification.
2. Confirm JSAPI payment is enabled for the mini-program payment scenario.
3. Complete one real mini-program payment against the deployed callback and replay the signed notification.
4. If WeChat classifies the app as a transaction mini-program, integrate order shipping/fulfillment reporting before public payment.

The API is live at the CloudBase HTTPS origin. Callback and active query-order paths both converge on `rpc_payment_apply_success`; a real CloudBase concurrency test proved eight identical success calls produce one `+50` grant and one purchase ledger.

## Production settings

```dotenv
WECHAT_MOCK_LOGIN=false
WECHAT_PAY_TEST_MODE=false
WECHAT_PAY_DESCRIPTION=那年的TA-50积分包
```

Secrets, private keys and APIv3 keys must not be committed or pasted into chat.
