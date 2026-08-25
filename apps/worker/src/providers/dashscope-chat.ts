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
    const response = await fetch(`${this.apiHost}/compatible-mode/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_completion_tokens: 160,
        enable_thinking: false,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`DashScope chat failed: ${(await response.text()).slice(0, 800)}`);
    const result = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = String(result.choices?.[0]?.message?.content || '').trim().slice(0, 80);
    if (!text) throw new Error('DashScope chat returned no text');
    return text;
  }
}
import type { VoiceChatMessage } from '../chat/voice-chat-context.js';
