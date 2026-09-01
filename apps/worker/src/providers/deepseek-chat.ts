import { OpenAICompatibleChatProvider } from './openai-compatible-chat.js';

export class DeepSeekChatProvider extends OpenAICompatibleChatProvider {
  constructor() {
    super({
      providerName: 'deepseek',
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      apiHost: process.env.DEEPSEEK_API_HOST || 'https://api.deepseek.com',
      endpointPath: process.env.DEEPSEEK_CHAT_PATH || '/chat/completions',
      model: process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-chat',
    });
  }
}
