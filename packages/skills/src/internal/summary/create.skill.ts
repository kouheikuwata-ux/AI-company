/**
 * 内部サマリー作成スキル
 *
 * テキストを要約するシンプルなスキル（外部影響なし）
 */

import { z } from 'zod';
import type { SkillSpec, SkillHandler, SkillContext } from '@ai-company-os/skill-spec';
import { ResponsibilityLevel } from '@ai-company-os/skill-spec';

/**
 * 入力スキーマ
 */
export const inputSchema = z.object({
  text: z.string().min(1).max(100000),
  max_length: z.number().int().min(50).max(2000).optional().default(500),
  language: z.enum(['ja', 'en']).optional().default('ja'),
});

export type Input = z.infer<typeof inputSchema>;

/**
 * 出力スキーマ
 */
export const outputSchema = z.object({
  summary: z.string(),
  original_length: z.number(),
  summary_length: z.number(),
  compression_ratio: z.number(),
});

export type Output = z.infer<typeof outputSchema>;

/**
 * スキル仕様
 */
export const spec: SkillSpec = {
  key: 'internal.summary.create',
  version: '1.0.0',
  name: 'テキスト要約',
  description: 'テキストを指定した長さに要約します',
  category: 'internal',
  tags: ['summary', 'text', 'llm'],

  input: {
    schema: inputSchema._def as unknown as Record<string, unknown>,
    examples: [
      {
        text: '長いテキスト...',
        max_length: 200,
        language: 'ja',
      },
    ],
  },

  output: {
    schema: outputSchema._def as unknown as Record<string, unknown>,
    examples: [
      {
        summary: '要約されたテキスト',
        original_length: 5000,
        summary_length: 200,
        compression_ratio: 0.04,
      },
    ],
  },

  cost_model: {
    fixed_cost: 0,
    per_token_input: 0.003,
    per_token_output: 0.015,
    estimated_tokens_input: 2000,
    estimated_tokens_output: 200,
  },

  safety: {
    requires_approval: false,
    timeout_seconds: 60,
    max_retries: 2,
    retry_delay_seconds: 5,
  },

  pii_policy: {
    input_contains_pii: false,
    output_contains_pii: false,
    pii_fields: [],
    handling: 'REJECT',
  },

  llm_policy: {
    training_opt_out: true,
    data_retention_days: 0,
    allowed_models: ['claude-sonnet-4-20250514'],
    max_context_tokens: 100000,
  },

  has_external_effect: false,
  required_responsibility_level: ResponsibilityLevel.AI_INTERNAL_ONLY,
};

/**
 * スキル実行ハンドラー
 */
export const execute: SkillHandler = async (
  input: Record<string, unknown>,
  context: SkillContext
) => {
  const parsed = inputSchema.parse(input);

  context.logger.info('Creating summary', {
    text_length: parsed.text.length,
    max_length: parsed.max_length,
  });

  // LLMを使用して要約
  const systemPrompt =
    parsed.language === 'ja'
      ? `あなたは優秀な要約者です。与えられたテキストを${parsed.max_length}文字以内で要約してください。重要なポイントを漏らさず、簡潔にまとめてください。`
      : `You are an excellent summarizer. Summarize the given text in ${parsed.max_length} characters or less. Be concise while covering all important points.`;

  const response = await context.llm.chat({
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: parsed.text,
      },
    ],
    max_tokens: Math.ceil(parsed.max_length * 1.5),
    temperature: 0.3,
  });

  const summary = response.content.slice(0, parsed.max_length);

  const output: Output = {
    summary,
    original_length: parsed.text.length,
    summary_length: summary.length,
    compression_ratio: summary.length / parsed.text.length,
  };

  context.logger.info('Summary created', {
    compression_ratio: output.compression_ratio,
  });

  return {
    output,
    actual_cost:
      (response.tokens_used.input / 1000) * spec.cost_model.per_token_input +
      (response.tokens_used.output / 1000) * spec.cost_model.per_token_output,
    tokens_used: response.tokens_used,
  };
};
