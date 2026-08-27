import fs from 'node:fs/promises';
import path from 'node:path';

interface UploadPolicy {
  upload_dir: string;
  oss_access_key_id: string;
  signature: string;
  policy: string;
  x_oss_object_acl: string;
  x_oss_forbid_overwrite: string;
  upload_host: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function trustedAliyunUrl(value: string): URL {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  const trustedHost = host === 'aliyuncs.com' || host.endsWith('.aliyuncs.com')
    || host === 'aliyun.com' || host.endsWith('.aliyun.com');
  if (url.protocol === 'http:' && trustedHost && !url.username && !url.password && !url.port) {
    url.protocol = 'https:';
  }
  if (url.protocol !== 'https:' || !trustedHost || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error(`untrusted Aliyun provider URL host: ${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}`);
  }
  return url;
}

async function responseError(response: Response): Promise<string> {
  return (await response.text()).slice(0, 1000);
}

export class AliyunCosyVoiceProvider {
  private readonly apiKey = required('DASHSCOPE_API_KEY');
  private readonly apiHost = trustedAliyunUrl(required('DASHSCOPE_API_HOST')).toString().replace(/\/$/, '');
  readonly targetModel = process.env.AIVOICE_TARGET_MODEL?.trim() || 'cosyvoice-v3.5-flash';

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  private async uploadPolicy(): Promise<UploadPolicy> {
    const urls = [`${this.apiHost}/api/v1/uploads`, 'https://dashscope.aliyuncs.com/api/v1/uploads'];
    let lastError = '';
    for (const url of urls) {
      const target = new URL(url);
      target.searchParams.set('action', 'getPolicy');
      target.searchParams.set('model', 'voice-enrollment');
      const response = await fetch(target, { headers: this.headers(), signal: AbortSignal.timeout(30_000) });
      if (response.ok) {
        const body = await response.json() as { data?: UploadPolicy };
        if (!body.data) throw new Error('Aliyun upload policy is missing data');
        return body.data;
      }
      lastError = await responseError(response);
      if ([401, 403].includes(response.status)) break;
    }
    throw new Error(`Aliyun upload policy failed: ${lastError}`);
  }

  private async uploadReference(filePath: string): Promise<string> {
    const policy = await this.uploadPolicy();
    const name = path.basename(filePath);
    const key = `${policy.upload_dir}/${name}`;
    const form = new FormData();
    form.append('OSSAccessKeyId', policy.oss_access_key_id);
    form.append('Signature', policy.signature);
    form.append('policy', policy.policy);
    form.append('x-oss-object-acl', policy.x_oss_object_acl);
    form.append('x-oss-forbid-overwrite', policy.x_oss_forbid_overwrite);
    form.append('key', key);
    form.append('success_action_status', '200');
    form.append('file', new Blob([await fs.readFile(filePath)], { type: 'audio/wav' }), name);
    const response = await fetch(trustedAliyunUrl(policy.upload_host), { method: 'POST', body: form, signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Aliyun reference upload failed: ${await responseError(response)}`);
    return `oss://${key}`;
  }

  private async customization(input: Record<string, unknown>) {
    const response = await fetch(`${this.apiHost}/api/v1/services/audio/tts/customization`, {
      method: 'POST',
      headers: this.headers({ 'X-DashScope-OssResourceResolve': 'enable' }),
      body: JSON.stringify({ model: 'voice-enrollment', input }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`Aliyun voice customization failed: ${await responseError(response)}`);
    return response.json() as Promise<{ output?: Record<string, unknown> }>;
  }

  async enroll(referencePath: string, prefix: string): Promise<string> {
    const url = await this.uploadReference(referencePath);
    const result = await this.customization({
      action: 'create_voice',
      target_model: this.targetModel,
      prefix: prefix.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10),
      url,
      language_hints: ['zh'],
      max_prompt_audio_length: 20,
      enable_preprocess: true,
      enable_volume_normalization: 'false',
    });
    const voiceId = String(result.output?.voice_id || '');
    if (!voiceId) throw new Error('Aliyun voice enrollment returned no voice_id');
    await this.waitReady(voiceId);
    return voiceId;
  }

  async waitReady(voiceId: string): Promise<void> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const result = await this.customization({ action: 'query_voice', voice_id: voiceId });
      const status = String(result.output?.status || '');
      if (status === 'OK') return;
      if (status === 'UNDEPLOYED') throw new Error('Aliyun voice enrollment was rejected');
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    throw new Error('Aliyun voice enrollment did not become ready');
  }

  async synthesize(
    voiceId: string,
    text: string,
    correlation: { jobId?: string; messageId?: string } = {},
  ): Promise<Buffer> {
    const totalStartedAt = Date.now();
    let requestMs = 0;
    let downloadMs = 0;
    try {
      const requestStartedAt = Date.now();
      const response = await fetch(`${this.apiHost}/api/v1/services/audio/tts/SpeechSynthesizer`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model: this.targetModel,
          input: {
            text,
            voice: voiceId,
            format: 'wav',
            sample_rate: 24000,
            language_hints: ['zh'],
            seed: 0,
          },
        }),
        signal: AbortSignal.timeout(120_000),
      });
      requestMs = Date.now() - requestStartedAt;
      if (!response.ok) throw new Error(`Aliyun synthesis failed: ${await responseError(response)}`);
      const result = await response.json() as { output?: { audio?: { url?: string } } };
      const audioUrl = result.output?.audio?.url;
      if (!audioUrl) throw new Error('Aliyun synthesis returned no audio URL');
      const downloadStartedAt = Date.now();
      const audio = await fetch(trustedAliyunUrl(audioUrl), { signal: AbortSignal.timeout(120_000) });
      if (!audio.ok) throw new Error('Aliyun synthesis output download failed');
      const buffer = Buffer.from(await audio.arrayBuffer());
      downloadMs = Date.now() - downloadStartedAt;
      console.info('cosyvoice_synthesis_timing', JSON.stringify({
        event: 'cosyvoice_synthesis_timing',
        status: 'SUCCEEDED',
        jobId: correlation.jobId || '',
        messageId: correlation.messageId || '',
        textLength: Array.from(text).length,
        requestMs,
        downloadMs,
        slowestStage: requestMs >= downloadMs ? 'provider_synthesis_request' : 'provider_audio_download',
        slowestStageMs: Math.max(requestMs, downloadMs),
        totalMs: Date.now() - totalStartedAt,
        overThreeSecondTarget: Date.now() - totalStartedAt > 3_000,
        bytes: buffer.length,
      }));
      return buffer;
    } catch (error) {
      console.error('cosyvoice_synthesis_timing', JSON.stringify({
        event: 'cosyvoice_synthesis_timing',
        status: 'FAILED',
        jobId: correlation.jobId || '',
        messageId: correlation.messageId || '',
        textLength: Array.from(text).length,
        requestMs,
        downloadMs,
        slowestStage: requestMs >= downloadMs ? 'provider_synthesis_request' : 'provider_audio_download',
        slowestStageMs: Math.max(requestMs, downloadMs),
        totalMs: Date.now() - totalStartedAt,
        overThreeSecondTarget: Date.now() - totalStartedAt > 3_000,
        error: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
      }));
      throw error;
    }
  }

  async deleteVoice(voiceId: string): Promise<void> {
    await this.customization({ action: 'delete_voice', voice_id: voiceId });
  }
}
