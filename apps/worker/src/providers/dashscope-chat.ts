import { OpenAICompatibleChatProvider } from './openai-compatible-chat.js';

export class DashscopeChatProvider extends OpenAICompatibleChatProvider {
  constructor() {
    super({
      providerName: 'dashscope',
      apiKey: process.env.DASHSCOPE_API_KEY || '',
      apiHost: process.env.DASHSCOPE_API_HOST || '',
      endpointPath: '/compatible-mode/v1/chat/completions',
      model: process.env.CHAT_MODEL?.trim() || 'qwen3.8-max',
      includeDashscopeThinkingFlags: true,
      enableExplicitPromptCache: process.env.AIVOICE_QWEN_EXPLICIT_PROMPT_CACHE === 'true',
    });
  }
}
