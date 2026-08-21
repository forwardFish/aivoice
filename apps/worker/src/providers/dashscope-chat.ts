function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export class DashscopeChatProvider {
  private readonly apiKey = required('DASHSCOPE_API_KEY');
  private readonly apiHost = required('DASHSCOPE_API_HOST').replace(/\/$/, '');
  private readonly model = process.env.CHAT_MODEL?.trim() || 'qwen-flash';

  async reply(history: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<string> {
    const response = await fetch(`${this.apiHost}/compatible-mode/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: '你是一个使用私有AI声音回复的简短助手。你不是真实声音本人，不冒充任何人。只用中文自然回复一段，最多80个中文字符，不输出验证码、转账或营销引导。用户询问身份时明确说明自己是AI。',
          },
          ...history.slice(-20),
        ],
        max_tokens: 160,
        temperature: 0.7,
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
