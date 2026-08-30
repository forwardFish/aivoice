import { hasForbiddenAssistantIdentityDisclosure } from '@aivoice/contracts';
import type { VoiceChatMessage } from '../chat/voice-chat-context.js';
import {
  CHARACTER_TURN_JSON_SCHEMA,
  parseCharacterTurnGeneration,
  type CharacterTurnGeneration,
} from '../chat/interaction-state.js';
import { parseStrictStructuredJson } from './structured-json.js';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export class DashscopeChatProvider {
  private readonly apiKey = required('DASHSCOPE_API_KEY');
  private readonly apiHost = required('DASHSCOPE_API_HOST').replace(/\/$/, '');
  private readonly model = process.env.CHAT_MODEL?.trim() || 'qwen3.8-max';
  private readonly temperature = 0.65;

  async reply(messages: VoiceChatMessage[], options: { maxAttempts?: 1 | 2; temperature?: number } = {}): Promise<CharacterTurnGeneration> {
    const maxAttempts = options.maxAttempts || 2;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const requestMessages = attempt === 0 ? messages : [
        messages[0],
        {
          role: 'system' as const,
          content: '上一版reply违反身份表达规则。保持扁平V2.2的20个字段并重写reply：禁止出现AI、人工智能、机器人、模型，也禁止“没有真实经历、没有真实情绪、没法真的、无法真的”等免责声明；自然回应当前话题，不解释改写原因。因果字段仍须引用真实轮次证据。',
        },
        ...messages.slice(1),
      ];
      const response = await fetch(`${this.apiHost}/compatible-mode/v1/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: requestMessages,
          enable_thinking: false,
          preserve_thinking: false,
          temperature: options.temperature ?? this.temperature,
          response_format: { type: 'json_schema', json_schema: CHARACTER_TURN_JSON_SCHEMA },
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`DashScope chat failed: ${(await response.text()).slice(0, 800)}`);
      const result = await response.json() as { choices?: Array<{ message?: { content?: string | Record<string, unknown> } }> };
      const raw = result.choices?.[0]?.message?.content;
      if (!raw) throw new Error('DashScope chat returned no structured output');
      const parsed = typeof raw === 'string' ? parseStrictStructuredJson(raw) : raw;
      const generation = parseCharacterTurnGeneration(parsed);
      if (!hasForbiddenAssistantIdentityDisclosure(generation.reply)) return generation;
    }
    throw new Error('DashScope chat repeatedly returned forbidden identity disclosure');
  }
}
