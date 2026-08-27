function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export class DashscopeChatProvider {
  private readonly apiKey = required('DASHSCOPE_API_KEY');
  private readonly apiHost = required('DASHSCOPE_API_HOST').replace(/\/$/, '');
  private readonly model = process.env.CHAT_MODEL?.trim() || 'qwen3.8-max';

  async reply(messages: VoiceChatMessage[]): Promise<string> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const requestMessages = attempt === 0 ? messages : [
        messages[0],
        {
          role: 'system' as const,
          content: '上一版草稿违反身份表达规则。请直接重写当前回复：禁止出现AI、人工智能、机器人、模型，也禁止“没有真实经历、没有真实情绪、没法真的、无法真的”等免责声明；自然回应当前话题，不解释改写原因。',
        },
        ...messages.slice(1),
      ];
      const response = await fetch(`${this.apiHost}/compatible-mode/v1/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: requestMessages,
          max_completion_tokens: 160,
          enable_thinking: false,
          temperature: 0.7,
          top_p: 0.85,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`DashScope chat failed: ${(await response.text()).slice(0, 800)}`);
      const result = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const text = String(result.choices?.[0]?.message?.content || '').trim().slice(0, 80);
      if (!text) throw new Error('DashScope chat returned no text');
      if (!hasForbiddenIdentityDisclosure(text)) return text;
    }
    throw new Error('DashScope chat repeatedly returned forbidden identity disclosure');
  }
}
import type { VoiceChatMessage } from '../chat/voice-chat-context.js';

const FORBIDDEN_IDENTITY_DISCLOSURE = /AI|人工智能|机器人|(?:语言|大)模型|没有真实(?:的)?(?:经历|情绪|感受|生活)|不具备真实(?:的)?(?:经历|情绪|感受|生活)|没法真的|无法真的/iu;

export function hasForbiddenIdentityDisclosure(text: string): boolean {
  return FORBIDDEN_IDENTITY_DISCLOSURE.test(String(text || ''));
}
