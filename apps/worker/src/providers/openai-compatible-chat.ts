import { hasForbiddenAssistantIdentityDisclosure } from '@aivoice/contracts';
import type { VoiceChatMessage } from '../chat/voice-chat-context.js';
import {
  CHARACTER_TURN_JSON_SCHEMA,
  parseCharacterTurnGeneration,
  type CharacterTurnGeneration,
} from '../chat/interaction-state.js';
import type { ChatProviderPort, ChatReplyOptions } from './chat-provider.js';
import { parseStrictStructuredJson } from './structured-json.js';

export interface OpenAICompatibleChatConfig {
  providerName: string;
  apiKey: string;
  apiHost: string;
  endpointPath: string;
  model: string;
  schemaMode: 'json_schema' | 'json_object';
  includeDashscopeThinkingFlags?: boolean;
  timeoutMs?: number;
}

function required(value: string, name: string): string {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

export class OpenAICompatibleChatProvider implements ChatProviderPort {
  readonly providerName: string;
  readonly modelName: string;
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly schemaMode: 'json_schema' | 'json_object';
  private readonly includeDashscopeThinkingFlags: boolean;
  private readonly timeoutMs: number;

  constructor(config: OpenAICompatibleChatConfig) {
    this.providerName = config.providerName;
    this.modelName = config.model;
    this.apiKey = required(config.apiKey, `${config.providerName} API key`);
    const host = required(config.apiHost, `${config.providerName} API host`).replace(/\/+$/u, '');
    const endpointPath = `/${String(config.endpointPath || '').replace(/^\/+|\/+$/gu, '')}`;
    this.endpoint = `${host}${endpointPath}`;
    this.schemaMode = config.schemaMode;
    this.includeDashscopeThinkingFlags = Boolean(config.includeDashscopeThinkingFlags);
    this.timeoutMs = config.timeoutMs || 60_000;
  }

  async reply(messages: VoiceChatMessage[], options: ChatReplyOptions = {}): Promise<CharacterTurnGeneration> {
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
      const body: Record<string, unknown> = {
        model: this.modelName,
        messages: requestMessages,
        temperature: options.temperature ?? 0.65,
        response_format: this.schemaMode === 'json_schema'
          ? { type: 'json_schema', json_schema: CHARACTER_TURN_JSON_SCHEMA }
          : { type: 'json_object' },
      };
      if (this.includeDashscopeThinkingFlags) {
        body.enable_thinking = false;
        body.preserve_thinking = false;
      }
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) throw new Error(`${this.providerName} chat failed: ${(await response.text()).slice(0, 800)}`);
      const result = await response.json() as {
        choices?: Array<{ message?: { content?: string | Record<string, unknown> } }>;
      };
      const raw = result.choices?.[0]?.message?.content;
      if (!raw) throw new Error(`${this.providerName} chat returned no structured output`);
      const parsed = typeof raw === 'string' ? parseStrictStructuredJson(raw) : raw;
      const generation = parseCharacterTurnGeneration(parsed);
      if (!hasForbiddenAssistantIdentityDisclosure(generation.reply)) return generation;
    }
    throw new Error(`${this.providerName} chat repeatedly returned forbidden identity disclosure`);
  }
}
