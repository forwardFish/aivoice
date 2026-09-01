import { DashscopeChatProvider } from './dashscope-chat.js';
import { DeepSeekChatProvider } from './deepseek-chat.js';
import { OpenAICompatibleChatProvider } from './openai-compatible-chat.js';
import type { ChatProviderPort } from './chat-provider.js';

export function createChatProviderFromEnv(): ChatProviderPort {
  const configured = String(process.env.AIVOICE_CHAT_PROVIDER || 'dashscope').trim().toLowerCase();
  if (configured === 'dashscope' || configured === 'qwen') return new DashscopeChatProvider();
  if (configured === 'deepseek') return new DeepSeekChatProvider();
  if (configured === 'openai-compatible') {
    return new OpenAICompatibleChatProvider({
      providerName: process.env.CHAT_PROVIDER_NAME || 'openai-compatible',
      apiKey: process.env.CHAT_API_KEY || '',
      apiHost: process.env.CHAT_API_HOST || '',
      endpointPath: process.env.CHAT_API_PATH || '/v1/chat/completions',
      model: process.env.CHAT_MODEL || '',
      responseMode: process.env.CHAT_RESPONSE_MODE === 'minimal_json_schema' ? 'minimal_json_schema' : 'json_object',
    });
  }
  throw new Error(`Unsupported AIVOICE_CHAT_PROVIDER: ${configured}`);
}
