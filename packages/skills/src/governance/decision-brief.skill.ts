/**
 * Decision Brief Skill
 *
 * 人間の判断を「代替しない」スキル。
 * 判断材料を1ページに圧縮して提供する。
 *
 * 設計原則：
 * - 結論・推奨は禁止
 * - 論点、選択肢、各選択肢のリスク、見るべき指標を提示
 * - 判断は必ず人間が行う
 * - 事実と分析を明確に区別
 */

import { z } from 'zod';
import type { SkillSpec, SkillHandler, SkillContext } from '@ai-company-os/skill-spec';
import { ResponsibilityLevel } from '@ai-company-os/skill-spec';

/**
 * 入力スキーマ
 */
export const inputSchema = z.object({
  /** 判断が必要な状況の説明 */
  situation: z.string().min(10).max(50000),

  /** 参照する実行ID（オプション） */
  reference_execution_ids: z.array(z.string().uuid()).optional(),

  /** 判断のカテゴリ */
  decision_category: z
    .enum([
      'operational', // 運用上の判断
      'financial', // 財務上の判断
      'technical', // 技術上の判断
      'strategic', // 戦略上の判断
      'compliance', // コンプライアンス上の判断
      'other',
    ])
    .default('operational'),

  /** 判断の緊急度（情報提供のみ、処理優先度には影響しない） */
  urgency: z.enum(['low', 'medium', 'high', 'critical']).optional(),

  /** 追加のコンテキスト情報 */
  additional_context: z.record(z.unknown()).optional(),

  /** 言語 */
  language: z.enum(['ja', 'en']).default('ja'),
});

export type Input = z.infer<typeof inputSchema>;

/**
 * 論点
 */
const issueSchema = z.object({
  /** 論点ID */
  id: z.string(),
  /** 論点の説明 */
  description: z.string(),
  /** 重要度（事実ベース） */
  importance: z.enum(['primary', 'secondary', 'contextual']),
  /** 関連データ */
  related_data: z.array(z.string()).optional(),
});

/**
 * 選択肢
 */
const optionSchema = z.object({
  /** 選択肢ID */
  id: z.string(),
  /** 選択肢の説明 */
  description: z.string(),
  /** この選択肢のリスク */
  risks: z.array(
    z.object({
      description: z.string(),
      likelihood: z.enum(['low', 'medium', 'high', 'unknown']),
      impact: z.enum(['low', 'medium', 'high', 'unknown']),
    })
  ),
  /** この選択肢のトレードオフ */
  tradeoffs: z.array(z.string()),
  /** 前提条件 */
  prerequisites: z.array(z.string()).optional(),
  /** 予想される影響範囲 */
  affected_areas: z.array(z.string()).optional(),
});

/**
 * 見るべき指標
 */
const metricSchema = z.object({
  /** 指標名 */
  name: z.string(),
  /** 説明 */
  description: z.string(),
  /** 現在値（取得可能な場合） */
  current_value: z.union([z.string(), z.number()]).optional(),
  /** なぜこの指標が重要か */
  relevance: z.string(),
  /** データソース */
  data_source: z.string().optional(),
});

/**
 * 出力スキーマ
 */
export const outputSchema = z.object({
  /** ブリーフメタデータ */
  brief_metadata: z.object({
    generated_at: z.string(),
    decision_category: z.string(),
    urgency: z.string().optional(),
    tenant_id: z.string(),
    /** 重要：このブリーフは判断材料であり、推奨ではない */
    disclaimer: z.string(),
  }),

  /** 状況要約（事実のみ） */
  situation_summary: z.object({
    /** 1〜3文での要約 */
    brief: z.string(),
    /** キーファクト */
    key_facts: z.array(z.string()),
    /** 不明点・情報ギャップ */
    information_gaps: z.array(z.string()),
  }),

  /** 論点 */
  issues: z.array(issueSchema),

  /** 選択肢（推奨順位なし） */
  options: z.array(optionSchema),

  /** 判断時に見るべき指標 */
  metrics_to_watch: z.array(metricSchema),

  /** 関連する過去の実行（参照用） */
  related_executions: z
    .array(
      z.object({
        execution_id: z.string(),
        skill_key: z.string(),
        state: z.string(),
        completed_at: z.string().optional(),
        relevance: z.string(),
      })
    )
    .optional(),

  /** タイムライン上の制約（事実のみ） */
  timeline_constraints: z
    .array(
      z.object({
        description: z.string(),
        deadline: z.string().optional(),
        source: z.string(),
      })
    )
    .optional(),
});

export type Output = z.infer<typeof outputSchema>;

/**
 * スキル仕様
 */
export const spec: SkillSpec = {
  key: 'governance.decision-brief',
  version: '1.0.0',
  name: '判断材料ブリーフ',
  description:
    '判断材料を1ページに圧縮して提供します。結論・推奨は行わず、論点・選択肢・リスク・見るべき指標を整理します。',
  category: 'governance',
  tags: ['governance', 'decision-support', 'analysis', 'risk'],

  input: {
    schema: inputSchema._def as unknown as Record<string, unknown>,
    examples: [
      {
        situation:
          '新規顧客からの大型案件について、標準の承認フローでは時間が足りない可能性がある。',
        decision_category: 'operational',
        urgency: 'high',
        language: 'ja',
      },
    ],
  },

  output: {
    schema: outputSchema._def as unknown as Record<string, unknown>,
    examples: [],
  },

  cost_model: {
    fixed_cost: 0.02,
    per_token_input: 0.003,
    per_token_output: 0.015,
    estimated_tokens_input: 2000,
    estimated_tokens_output: 1500,
  },

  safety: {
    // 判断支援のため承認必須
    requires_approval: true,
    timeout_seconds: 120,
    max_retries: 2,
    retry_delay_seconds: 10,
  },

  pii_policy: {
    // 状況説明にPIIが含まれる可能性あり
    input_contains_pii: true,
    output_contains_pii: false,
    pii_fields: ['situation', 'additional_context'],
    handling: 'MASK_BEFORE_LLM',
  },

  llm_policy: {
    training_opt_out: true,
    data_retention_days: 0,
    allowed_models: ['claude-sonnet-4-20250514'],
    max_context_tokens: 100000,
  },

  // 分析のみ、外部影響なし
  has_external_effect: false,

  // 判断支援のため人間の直接関与が必要
  required_responsibility_level: ResponsibilityLevel.HUMAN_DIRECT,
};

/**
 * スキル実行ハンドラー
 */
export const execute: SkillHandler = async (
  input: Record<string, unknown>,
  context: SkillContext
) => {
  const parsed = inputSchema.parse(input);

  context.logger.info('Generating decision brief', {
    decision_category: parsed.decision_category,
    urgency: parsed.urgency,
    situation_length: parsed.situation.length,
  });

  // 免責事項（言語別）
  const disclaimer =
    parsed.language === 'ja'
      ? 'このブリーフは判断材料の整理を目的としており、特定の行動を推奨するものではありません。最終的な判断は責任者が行ってください。'
      : 'This brief is intended to organize decision-making materials and does not recommend any specific action. The final decision must be made by the responsible person.';

  // LLMを使用して分析
  const systemPrompt =
    parsed.language === 'ja'
      ? `あなたは経営判断の材料を整理するアナリストです。

重要な制約：
- 結論や推奨を絶対に出さないでください
- 「〜すべき」「〜が良い」などの判断を含む表現を使わないでください
- 事実と分析を明確に区別してください
- 選択肢は並列に提示し、優先順位をつけないでください

あなたの役割は判断材料を整理することであり、判断を下すことではありません。`
      : `You are an analyst who organizes materials for executive decisions.

Critical constraints:
- NEVER provide conclusions or recommendations
- Do NOT use expressions containing judgments such as "should" or "would be better"
- Clearly distinguish between facts and analysis
- Present options in parallel without prioritization

Your role is to organize decision materials, NOT to make decisions.`;

  const userPrompt =
    parsed.language === 'ja'
      ? `以下の状況について、判断材料を整理してください。

【状況】
${parsed.situation}

【カテゴリ】${parsed.decision_category}
${parsed.urgency ? `【緊急度】${parsed.urgency}` : ''}
${parsed.additional_context ? `【追加情報】${JSON.stringify(parsed.additional_context)}` : ''}

以下の形式でJSONを出力してください：
{
  "situation_summary": {
    "brief": "1〜3文での状況要約",
    "key_facts": ["事実1", "事実2"],
    "information_gaps": ["不明点1", "不明点2"]
  },
  "issues": [
    {
      "id": "issue-1",
      "description": "論点の説明",
      "importance": "primary|secondary|contextual",
      "related_data": ["関連データ"]
    }
  ],
  "options": [
    {
      "id": "option-1",
      "description": "選択肢の説明",
      "risks": [
        {"description": "リスク説明", "likelihood": "low|medium|high|unknown", "impact": "low|medium|high|unknown"}
      ],
      "tradeoffs": ["トレードオフ1"],
      "prerequisites": ["前提条件"],
      "affected_areas": ["影響範囲"]
    }
  ],
  "metrics_to_watch": [
    {
      "name": "指標名",
      "description": "説明",
      "relevance": "なぜ重要か",
      "data_source": "データソース"
    }
  ],
  "timeline_constraints": [
    {
      "description": "制約の説明",
      "deadline": "期限（あれば）",
      "source": "情報源"
    }
  ]
}`
      : `Please organize decision materials for the following situation.

【Situation】
${parsed.situation}

【Category】${parsed.decision_category}
${parsed.urgency ? `【Urgency】${parsed.urgency}` : ''}
${parsed.additional_context ? `【Additional Context】${JSON.stringify(parsed.additional_context)}` : ''}

Output in JSON format as specified.`;

  const response = await context.llm.chat({
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
    max_tokens: 3000,
    temperature: 0.2, // 低めで一貫性を重視
  });

  // LLMレスポンスをパース
  let analysisResult;
  try {
    // JSONを抽出（コードブロック対応）
    const jsonMatch = response.content.match(/```(?:json)?\s*([\s\S]*?)```/) ||
      response.content.match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
      analysisResult = JSON.parse(jsonMatch[1]);
    } else {
      throw new Error('No JSON found in response');
    }
  } catch {
    context.logger.warn('Failed to parse LLM response as JSON, using fallback structure');
    analysisResult = {
      situation_summary: {
        brief: parsed.situation.slice(0, 200),
        key_facts: [],
        information_gaps: ['LLM分析の解析に失敗しました'],
      },
      issues: [],
      options: [],
      metrics_to_watch: [],
      timeline_constraints: [],
    };
  }

  const output: Output = {
    brief_metadata: {
      generated_at: new Date().toISOString(),
      decision_category: parsed.decision_category,
      urgency: parsed.urgency,
      tenant_id: context.tenant_id,
      disclaimer,
    },
    situation_summary: analysisResult.situation_summary || {
      brief: '',
      key_facts: [],
      information_gaps: [],
    },
    issues: (analysisResult.issues || []).map(
      (
        issue: {
          id?: string;
          description?: string;
          importance?: string;
          related_data?: string[];
        },
        index: number
      ) => ({
        id: issue.id || `issue-${index + 1}`,
        description: issue.description || '',
        importance: issue.importance || 'contextual',
        related_data: issue.related_data || [],
      })
    ),
    options: (analysisResult.options || []).map(
      (
        option: {
          id?: string;
          description?: string;
          risks?: Array<{
            description?: string;
            likelihood?: string;
            impact?: string;
          }>;
          tradeoffs?: string[];
          prerequisites?: string[];
          affected_areas?: string[];
        },
        index: number
      ) => ({
        id: option.id || `option-${index + 1}`,
        description: option.description || '',
        risks: (option.risks || []).map((r) => ({
          description: r.description || '',
          likelihood: r.likelihood || 'unknown',
          impact: r.impact || 'unknown',
        })),
        tradeoffs: option.tradeoffs || [],
        prerequisites: option.prerequisites || [],
        affected_areas: option.affected_areas || [],
      })
    ),
    metrics_to_watch: (analysisResult.metrics_to_watch || []).map(
      (metric: {
        name?: string;
        description?: string;
        current_value?: string | number;
        relevance?: string;
        data_source?: string;
      }) => ({
        name: metric.name || '',
        description: metric.description || '',
        current_value: metric.current_value,
        relevance: metric.relevance || '',
        data_source: metric.data_source,
      })
    ),
    related_executions: parsed.reference_execution_ids?.map((id) => ({
      execution_id: id,
      skill_key: 'unknown',
      state: 'unknown',
      relevance: 'Referenced by user',
    })),
    timeline_constraints: analysisResult.timeline_constraints,
  };

  context.logger.info('Decision brief generated', {
    issues_count: output.issues.length,
    options_count: output.options.length,
    metrics_count: output.metrics_to_watch.length,
  });

  return {
    output,
    actual_cost:
      spec.cost_model.fixed_cost +
      (response.tokens_used.input / 1000) * spec.cost_model.per_token_input +
      (response.tokens_used.output / 1000) * spec.cost_model.per_token_output,
    tokens_used: response.tokens_used,
    metadata: {
      brief_type: 'decision_brief',
      llm_model: response.model,
    },
  };
};
