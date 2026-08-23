import { scf } from 'tencentcloud-sdk-nodejs-scf';

let client: InstanceType<typeof scf.v20180416.Client> | null = null;
const inflight = new Map<string, Promise<void>>();

function getClient(): InstanceType<typeof scf.v20180416.Client> {
  if (client) return client;
  const secretId = process.env.CLOUDBASE_SCF_SECRET_ID || process.env.TENCENTCLOUD_SECRETID || '';
  const secretKey = process.env.CLOUDBASE_SCF_SECRET_KEY || process.env.TENCENTCLOUD_SECRETKEY || '';
  if (!secretId || !secretKey) throw new Error('Cloud Function invoke credentials are missing');
  client = new scf.v20180416.Client({
    credential: { secretId, secretKey },
    region: process.env.CLOUDBASE_SCF_REGION || 'ap-shanghai',
    profile: { httpProfile: { endpoint: 'scf.tencentcloudapi.com' } },
  });
  return client;
}

export async function invokeWorkerAsync(input: { jobId: string; type?: string }): Promise<string> {
  if (!input.jobId) throw new Error('jobId is required for Cloud Function invocation');
  if (!inflight.has(input.jobId)) {
    const dispatch = getClient().InvokeFunction({
      FunctionName: process.env.CLOUDBASE_WORKER_FUNCTION_NAME || 'aivoice-worker',
      Namespace: process.env.CLOUDBASE_FUNCTION_NAMESPACE || process.env.CLOUDBASE_ENV_ID || 'default',
      Event: JSON.stringify(input),
      LogType: 'None',
    }).then((response) => {
      if (response.Result?.ErrMsg) throw new Error(response.Result.ErrMsg);
    }).catch((error) => {
      console.error('Cloud Function background dispatch failed', { jobId: input.jobId, error });
    }).finally(() => {
      inflight.delete(input.jobId);
    });
    inflight.set(input.jobId, dispatch);
  }
  return `background:${input.jobId}`;
}
