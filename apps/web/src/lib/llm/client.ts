import Anthropic from '@anthropic-ai/sdk';
import type { LLMClient, LLMChatParams, LLMChatResponse } from '@ai-company-os/skill-spec';

/**
 * Anthropic Claude クライアント
 */
export function createLLMClient(): LLMClient {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  return {
    async chat(params: LLMChatParams): Promise<LLMChatResponse> {
      const model = params.model || 'claude-sonnet-4-20250514';
      const maxTokens = params.max_tokens || 4096;

      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: params.system,
        messages: params.messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        temperature: params.temperature,
      });

      // テキストコンテンツを抽出
      const textContent = response.content.find((c) => c.type === 'text');
      const content = textContent?.type === 'text' ? textContent.text : '';

      return {
        content,
        tokens_used: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
        },
        model: response.model,
      };
    },
  };
}
