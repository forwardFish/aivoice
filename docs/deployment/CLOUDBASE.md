# CloudBase deployment

## Target layout

- CloudBase PostgreSQL parent environment: `aivoice-d1g94bgoh67c6b974`.
- Cloud Run child environment: `aivoice-run-d9gu3ee7n56f21869`.
- Combined API and Worker service: `aivoice-api`.
- Default HTTPS origin: `https://aivoice-api-301049-8-1434074357.sh.run.tcloudbase.com`.
- Keep the existing `aiassistant-0517` environment and `express-oy31` service unchanged.
- Payment callback: `https://aivoice-api-301049-8-1434074357.sh.run.tcloudbase.com/v1/payments/wechat/notify`.

The existing `aiassistant-0517-d6en8tw82f2f7fc` environment is a legacy environment. A live `ExecutePGSql` probe returned `ResourceNotFound.InstanceNotFound`, so it cannot supply the PostgreSQL database required by the current Drizzle schema and transaction logic.

The new Personal-tier PostgreSQL resource is a shared cluster. CloudBase disables raw PostgreSQL passwords and protocol-level direct connections for this shared cluster. The seven checked-in migrations are mirrored to CloudBase PostgreSQL through the management API, but the currently running MVP container uses an embedded PostgreSQL instance so that the unchanged NestJS/Drizzle transaction code can run. This embedded database is ephemeral and is not a production persistence solution.

## Container contract

The root `Dockerfile` builds and starts embedded PostgreSQL, the NestJS API, the Worker, and FFmpeg in one fixed Cloud Run instance. On startup it applies the checked-in Drizzle migrations before listening on port `80`. The deployment script creates a strict staging directory and excludes local environment files, certificates, private keys, authorized source videos, generated media, test evidence, and documentation from the remote build context.

Required Cloud Run environment variables:

```text
NODE_ENV=production
PORT=80
DATABASE_URL=postgresql://...
PUBLIC_BASE_URL=https://<default-domain>
MEDIA_LOCAL_ROOT=/app/.runtime/media
MEDIA_SIGNING_SECRET=...
WECHAT_APP_ID=...
WECHAT_APP_SECRET=...
WECHAT_PAY_MCH_ID=...
WECHAT_PAY_SERIAL_NO=...
WECHAT_PAY_PRIVATE_KEY=...
WECHAT_PAY_MERCHANT_CERT=...
WECHAT_PAY_API_V3_KEY=...
WECHAT_PAY_PUBLIC_KEY_ID=...
WECHAT_PAY_PUBLIC_KEY=...
WECHAT_PAY_NOTIFY_URL=https://<default-domain>/v1/payments/wechat/notify
WECHAT_PAY_DESCRIPTION=那时的TA-50积分包
WECHAT_PAY_TEST_MODE=false
```

Secret values must be configured in CloudBase service settings and must not be committed or uploaded as files in the Docker build context.

## Remaining production boundary

The public service is running and `/v1/health` returns HTTP 200. Before production release:

- replace embedded PostgreSQL with a durable directly connectable database or migrate the data layer to CloudBase PostgreSQL REST/RPC;
- move media from container-local storage to CloudBase storage;
- download the WeChat Pay public key PEM and public-key ID from the merchant platform and configure both values;
- complete an authenticated DevTools or real-device flow using a WeChat developer account authorized for AppID `wx106e5dcda1d1baeb`.
