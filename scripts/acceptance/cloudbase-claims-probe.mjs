import fs from 'node:fs';
import { parse as parseDotEnv } from 'dotenv';
import CloudBase from '@cloudbase/manager-node';
import { CloudBaseRuntimeClient } from '@aivoice/cloudbase-runtime';

const state = JSON.parse(fs.readFileSync('D:/lyh/secrets/aivoice/cloudbase/deployment-state.json', 'utf8'));
const credentials = parseDotEnv(fs.readFileSync(
  process.env.CLOUDBASE_CREDENTIALS_FILE
    || 'D:/lyh/agent/agent-frame/printersheet/ai-exam-miniapp/server/.env',
));
const manager = new CloudBase({
  envId: state.envId,
  region: 'ap-shanghai',
  secretId: credentials.TENCENTCLOUD_SECRETID,
  secretKey: credentials.TENCENTCLOUD_SECRETKEY,
});
await manager.database.executePGSql({
  Sql: `CREATE OR REPLACE FUNCTION public._aivoice_debug_claims()
        RETURNS jsonb LANGUAGE sql STABLE AS $$
          SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
        $$`,
});
try {
  const claims = await new CloudBaseRuntimeClient(state.envId, state.runtimeApiKey)
    .rpc('_aivoice_debug_claims', {});
  console.log(JSON.stringify({
    role: claims.role,
    appRole: claims.app_role,
    clientType: claims.client_type,
    platform: claims.meta?.platform,
    appMetadata: claims.appMetadata,
    keys: Object.keys(claims).sort(),
  }, null, 2));
} finally {
  await manager.database.executePGSql({
    Sql: 'DROP FUNCTION IF EXISTS public._aivoice_debug_claims()',
  });
}
