/**
 * Skill Performance Improvement Proposal Skill
 *
 * スキルのパフォーマンスデータを分析し、改善提案を生成する。
 * HR Manager が定期的に使用し、スキルの品質向上を支援する。
 *
 * 設計原則：
 * - データに基づく客観的な分析
 * - 具体的かつ実行可能な提案
 * - 最終判断は人間が行う
 */

import { z } from 'zod';
import type { SkillSpec, SkillHandler, SkillContext } from '@ai-company-os/skill-spec';
import { ResponsibilityLevel } from '@ai-company-os/skill-spec';

/**
 * 入力スキーマ
 */
export const inputSchema = z.object({
  /** 分析期間 */
  analysis_period: z.enum(['daily', 'weekly', 'monthly']).default('weekly'),

  /** 対象スキル（空の場合は全スキル） */
  target_skills: z.array(z.string()).optional(),

  /** 最大提案数 */
  max_proposals: z.number().min(1).max(20).default(5),

  /** 改善閾値 */
  thresholds: z
    .object({
      /** 成功率がこれ以下のスキルを対象 */
      success_rate_below: z.number().min(0).max(1).default(0.95),
      /** 平均レイテンシがこれ以上のスキルを対象 */
      latency_above_ms: z.number().default(3000),
      /** コスト効率がこれ以下のスキルを対象 */
      cost_efficiency_below: z.number().min(0).max(1).default(0.7),
    })
    .optional(),

  /** 改善カテゴリのフィルタ */
  improvement_categories: z
    .array(z.enum(['performance', 'reliability', 'cost', 'usability']))
    .optional(),
});

export type Input = z.infer<typeof inputSchema>;

/**
 * 改善提案
 */
const improvementProposalSchema = z.object({
  /** 提案ID */
  id: z.string(),

  /** 対象スキル */
  skill_key: z.string(),
  skill_name: z.string(),

  /** 改善カテゴリ */
  category: z.enum(['performance', 'reliability', 'cost', 'usability']),

  /** 優先度 */
  priority: z.enum(['critical', 'high', 'medium', 'low']),

  /** 現状の問題 */
  current_issue: z.object({
    description: z.string(),
    metric_name: z.string(),
    current_value: z.number(),
    target_value: z.number(),
    unit: z.string(),
  }),

  /** 提案内容 */
  proposal: z.object({
    title: z.string(),
    description: z.string(),
    expected_improvement: z.string(),
    implementation_steps: z.array(z.string()),
    estimated_effort: z.enum(['small', 'medium', 'large']),
    risk_level: z.enum(['low', 'medium', 'high']),
  }),

  /** 根拠データ */
  evidence: z.object({
    data_points: z.number(),
    confidence_score: z.number(), // 0-1
    trend: z.enum(['improving', 'stable', 'degrading']),
    anomalies_detected: z.number(),
  }),

  /** 影響範囲 */
  impact: z.object({
    affected_agents: z.array(z.string()),
    affected_workflows: z.array(z.string()),
    estimated_cost_saving: z.number().optional(),
    estimated_time_saving_percent: z.number().optional(),
  }),
});

/**
 * 出力スキーマ
 */
export const outputSchema = z.object({
  /** 分析日時 */
  analyzed_at: z.string(),

  /** 分析期間 */
  period: z.object({
    type: z.string(),
    start: z.string(),
    end: z.string(),
  }),

  /** サマリー */
  summary: z.object({
    skills_analyzed: z.number(),
    skills_with_issues: z.number(),
    total_proposals: z.number(),
    by_category: z.record(z.string(), z.number()),
    by_priority: z.record(z.string(), z.number()),
    overall_health_score: z.number(), // 0-100
  }),

  /** 改善提案一覧 */
  proposals: z.array(improvementProposalSchema),

  /** 全体的な傾向 */
  trends: z.object({
    performance_trend: z.enum(['improving', 'stable', 'degrading']),
    reliability_trend: z.enum(['improving', 'stable', 'degrading']),
    cost_trend: z.enum(['improving', 'stable', 'degrading']),
  }),

  /** 推奨アクション（優先順） */
  recommended_actions: z.array(z.object({
    rank: z.number(),
    proposal_id: z.string(),
    reason: z.string(),
  })),
});

export type Output = z.infer<typeof outputSchema>;

/**
 * スキル仕様
 */
export const spec: SkillSpec = {
  key: 'ai-affairs.performance-improvement',
  version: '1.0.0',
  name: 'スキルパフォーマンス改善提案',
  description:
    'スキルのパフォーマンスデータを分析し、具体的な改善提案を生成します。データに基づく客観的な分析を行い、最終判断は人間が行います。',
  category: 'ai-affairs',
  tags: ['ai-affairs', 'performance', 'improvement', 'proposal', 'optimization'],

  input: {
    schema: inputSchema._def as unknown as Record<string, unknown>,
    examples: [
      {
        analysis_period: 'weekly',
        max_proposals: 5,
      },
    ],
  },

  output: {
    schema: outputSchema._def as unknown as Record<string, unknown>,
    examples: [],
  },

  cost_model: {
    fixed_cost: 0.01,
    per_token_input: 0.003,
    per_token_output: 0.015,
    estimated_tokens_input: 500,
    estimated_tokens_output: 1500,
  },

  safety: {
    requires_approval: false,
    timeout_seconds: 120,
    max_retries: 2,
    retry_delay_seconds: 10,
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
    max_context_tokens: 30000,
  },

  has_external_effect: false,
  required_responsibility_level: ResponsibilityLevel.AI_WITH_REVIEW,
};

/**
 * 改善提案生成ルール
 */
interface PerformanceData {
  skill_key: string;
  skill_name: string;
  success_rate: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  error_count: number;
  timeout_count: number;
  total_executions: number;
  avg_cost: number;
  cost_efficiency: number;
  trend: 'improving' | 'stable' | 'degrading';
}

function generateProposals(
  data: PerformanceData,
  thresholds: {
    success_rate_below: number;
    latency_above_ms: number;
    cost_efficiency_below: number;
  }
): Array<{
  category: 'performance' | 'reliability' | 'cost' | 'usability';
  priority: 'critical' | 'high' | 'medium' | 'low';
  issue: {
    description: string;
    metric_name: string;
    current_value: number;
    target_value: number;
    unit: string;
  };
  proposal: {
    title: string;
    description: string;
    expected_improvement: string;
    steps: string[];
    effort: 'small' | 'medium' | 'large';
    risk: 'low' | 'medium' | 'high';
  };
}> {
  const proposals: Array<{
    category: 'performance' | 'reliability' | 'cost' | 'usability';
    priority: 'critical' | 'high' | 'medium' | 'low';
    issue: {
      description: string;
      metric_name: string;
      current_value: number;
      target_value: number;
      unit: string;
    };
    proposal: {
      title: string;
      description: string;
      expected_improvement: string;
      steps: string[];
      effort: 'small' | 'medium' | 'large';
      risk: 'low' | 'medium' | 'high';
    };
  }> = [];

  // 成功率が低い場合
  if (data.success_rate < thresholds.success_rate_below) {
    const priority = data.success_rate < 0.8 ? 'critical' : data.success_rate < 0.9 ? 'high' : 'medium';
    proposals.push({
      category: 'reliability',
      priority,
      issue: {
        description: `成功率が${(data.success_rate * 100).toFixed(1)}%と目標値を下回っています`,
        metric_name: 'success_rate',
        current_value: data.success_rate,
        target_value: thresholds.success_rate_below,
        unit: '%',
      },
      proposal: {
        title: 'エラーハンドリングの強化',
        description: 'エラーログを分析し、頻発するエラーパターンに対する防御的なコードを追加します。リトライロジックの見直しも検討してください。',
        expected_improvement: `成功率を${(thresholds.success_rate_below * 100).toFixed(0)}%以上に改善`,
        steps: [
          'エラーログの詳細分析を実施',
          '頻発するエラーパターンを特定',
          '入力バリデーションの強化',
          'リトライロジックの最適化',
          'タイムアウト設定の見直し',
        ],
        effort: 'medium',
        risk: 'low',
      },
    });
  }

  // レイテンシが高い場合
  if (data.avg_latency_ms > thresholds.latency_above_ms) {
    const priority = data.avg_latency_ms > thresholds.latency_above_ms * 2 ? 'high' : 'medium';
    proposals.push({
      category: 'performance',
      priority,
      issue: {
        description: `平均レイテンシが${data.avg_latency_ms}msと目標値を超過しています`,
        metric_name: 'avg_latency_ms',
        current_value: data.avg_latency_ms,
        target_value: thresholds.latency_above_ms,
        unit: 'ms',
      },
      proposal: {
        title: 'レスポンス時間の最適化',
        description: '処理のボトルネックを特定し、キャッシュの導入やクエリの最適化を行います。',
        expected_improvement: `平均レイテンシを${thresholds.latency_above_ms}ms以下に短縮`,
        steps: [
          'パフォーマンスプロファイリングの実施',
          'ボトルネック箇所の特定',
          'DBクエリの最適化（インデックス追加等）',
          'キャッシュ戦略の導入検討',
          '非同期処理への変更検討',
        ],
        effort: 'large',
        risk: 'medium',
      },
    });
  }

  // P95レイテンシが極端に高い場合（平均の3倍以上）
  if (data.p95_latency_ms > data.avg_latency_ms * 3) {
    proposals.push({
      category: 'performance',
      priority: 'medium',
      issue: {
        description: `P95レイテンシ(${data.p95_latency_ms}ms)が平均値の3倍以上と不安定です`,
        metric_name: 'p95_latency_ms',
        current_value: data.p95_latency_ms,
        target_value: data.avg_latency_ms * 2,
        unit: 'ms',
      },
      proposal: {
        title: 'レイテンシの安定化',
        description: '外れ値の原因を特定し、特定条件下での処理遅延を解消します。',
        expected_improvement: 'P95レイテンシを平均値の2倍以内に安定化',
        steps: [
          '遅延が発生するケースのパターン分析',
          '特定入力による処理遅延の調査',
          'リソース競合の有無を確認',
          'タイムアウト設定の適正化',
        ],
        effort: 'medium',
        risk: 'low',
      },
    });
  }

  // コスト効率が低い場合
  if (data.cost_efficiency < thresholds.cost_efficiency_below) {
    proposals.push({
      category: 'cost',
      priority: data.cost_efficiency < 0.5 ? 'high' : 'medium',
      issue: {
        description: `コスト効率が${(data.cost_efficiency * 100).toFixed(1)}%と低い水準です`,
        metric_name: 'cost_efficiency',
        current_value: data.cost_efficiency,
        target_value: thresholds.cost_efficiency_below,
        unit: '%',
      },
      proposal: {
        title: 'コスト最適化',
        description: 'トークン使用量の削減やプロンプトの効率化を行い、実行コストを削減します。',
        expected_improvement: `コスト効率を${(thresholds.cost_efficiency_below * 100).toFixed(0)}%以上に改善`,
        steps: [
          '入出力トークン数の分析',
          'プロンプトの簡潔化',
          '不要な処理の削除',
          'バッチ処理の導入検討',
          'モデル選択の最適化',
        ],
        effort: 'small',
        risk: 'low',
      },
    });
  }

  // タイムアウトが多い場合
  if (data.timeout_count > 0 && data.timeout_count / data.total_executions > 0.01) {
    proposals.push({
      category: 'reliability',
      priority: 'high',
      issue: {
        description: `タイムアウト率が${((data.timeout_count / data.total_executions) * 100).toFixed(2)}%発生しています`,
        metric_name: 'timeout_rate',
        current_value: data.timeout_count / data.total_executions,
        target_value: 0.01,
        unit: '%',
      },
      proposal: {
        title: 'タイムアウト対策',
        description: 'タイムアウトの原因を特定し、処理時間の短縮または設定値の見直しを行います。',
        expected_improvement: 'タイムアウト率を1%以下に削減',
        steps: [
          'タイムアウト発生時の入力パターン分析',
          '処理時間の長い箇所の特定',
          'タイムアウト設定値の見直し',
          '段階的処理への変更検討',
        ],
        effort: 'medium',
        risk: 'medium',
      },
    });
  }

  // 傾向が悪化している場合
  if (data.trend === 'degrading') {
    proposals.push({
      category: 'reliability',
      priority: 'medium',
      issue: {
        description: 'パフォーマンスが悪化傾向にあります',
        metric_name: 'trend',
        current_value: -1,
        target_value: 0,
        unit: 'trend',
      },
      proposal: {
        title: '悪化傾向の調査と対策',
        description: 'パフォーマンス悪化の根本原因を調査し、早期に対策を講じます。',
        expected_improvement: '悪化傾向を安定化または改善傾向に転換',
        steps: [
          '悪化開始時期の特定',
          '変更履歴との相関分析',
          'リソース使用状況の確認',
          '外部依存サービスの状態確認',
        ],
        effort: 'medium',
        risk: 'low',
      },
    });
  }

  return proposals;
}

/**
 * スキル実行ハンドラー
 */
export const execute: SkillHandler = async (
  input: Record<string, unknown>,
  context: SkillContext
) => {
  const parsed = inputSchema.parse(input);
  const thresholds = parsed.thresholds || {
    success_rate_below: 0.95,
    latency_above_ms: 3000,
    cost_efficiency_below: 0.7,
  };

  context.logger.info('Generating performance improvement proposals', {
    analysis_period: parsed.analysis_period,
    max_proposals: parsed.max_proposals,
  });

  const now = new Date();
  let periodStart: Date;

  switch (parsed.analysis_period) {
    case 'daily':
      periodStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case 'weekly':
      periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'monthly':
      periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
  }

  // プレースホルダーデータ（実際はDBから取得）
  // 実運用時はRunner経由でDB集計結果を受け取る
  const skillsData: PerformanceData[] = [];

  // 提案を生成
  const allProposals: Array<{
    id: string;
    skill_key: string;
    skill_name: string;
    category: 'performance' | 'reliability' | 'cost' | 'usability';
    priority: 'critical' | 'high' | 'medium' | 'low';
    current_issue: {
      description: string;
      metric_name: string;
      current_value: number;
      target_value: number;
      unit: string;
    };
    proposal: {
      title: string;
      description: string;
      expected_improvement: string;
      implementation_steps: string[];
      estimated_effort: 'small' | 'medium' | 'large';
      risk_level: 'low' | 'medium' | 'high';
    };
    evidence: {
      data_points: number;
      confidence_score: number;
      trend: 'improving' | 'stable' | 'degrading';
      anomalies_detected: number;
    };
    impact: {
      affected_agents: string[];
      affected_workflows: string[];
      estimated_cost_saving?: number;
      estimated_time_saving_percent?: number;
    };
  }> = [];

  let proposalId = 1;
  for (const data of skillsData) {
    const proposals = generateProposals(data, thresholds);

    // カテゴリフィルタ
    const filtered = parsed.improvement_categories
      ? proposals.filter(p => parsed.improvement_categories!.includes(p.category))
      : proposals;

    for (const p of filtered) {
      allProposals.push({
        id: `PROP-${String(proposalId++).padStart(4, '0')}`,
        skill_key: data.skill_key,
        skill_name: data.skill_name,
        category: p.category,
        priority: p.priority,
        current_issue: p.issue,
        proposal: {
          title: p.proposal.title,
          description: p.proposal.description,
          expected_improvement: p.proposal.expected_improvement,
          implementation_steps: p.proposal.steps,
          estimated_effort: p.proposal.effort,
          risk_level: p.proposal.risk,
        },
        evidence: {
          data_points: data.total_executions,
          confidence_score: Math.min(1, data.total_executions / 100),
          trend: data.trend,
          anomalies_detected: 0,
        },
        impact: {
          affected_agents: [],
          affected_workflows: [],
          estimated_cost_saving: p.category === 'cost' ? data.avg_cost * 0.2 : undefined,
          estimated_time_saving_percent: p.category === 'performance' ? 30 : undefined,
        },
      });
    }
  }

  // 優先度でソートして上位を取得
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  allProposals.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  const topProposals = allProposals.slice(0, parsed.max_proposals);

  // 集計
  const byCategory: Record<string, number> = {};
  const byPriority: Record<string, number> = {};

  for (const p of topProposals) {
    byCategory[p.category] = (byCategory[p.category] || 0) + 1;
    byPriority[p.priority] = (byPriority[p.priority] || 0) + 1;
  }

  // 推奨アクション（優先順）
  const recommendedActions = topProposals.slice(0, 3).map((p, i) => ({
    rank: i + 1,
    proposal_id: p.id,
    reason: `${p.priority}優先度: ${p.current_issue.description}`,
  }));

  const output: Output = {
    analyzed_at: now.toISOString(),
    period: {
      type: parsed.analysis_period,
      start: periodStart.toISOString(),
      end: now.toISOString(),
    },
    summary: {
      skills_analyzed: skillsData.length,
      skills_with_issues: new Set(allProposals.map(p => p.skill_key)).size,
      total_proposals: topProposals.length,
      by_category: byCategory,
      by_priority: byPriority,
      overall_health_score: skillsData.length > 0
        ? Math.round(skillsData.reduce((sum, d) => sum + d.success_rate * 100, 0) / skillsData.length)
        : 100,
    },
    proposals: topProposals,
    trends: {
      performance_trend: 'stable',
      reliability_trend: 'stable',
      cost_trend: 'stable',
    },
    recommended_actions: recommendedActions,
  };

  context.logger.info('Performance improvement proposals generated', {
    proposals_count: topProposals.length,
  });

  return {
    output,
    actual_cost: spec.cost_model.fixed_cost,
    metadata: {
      skill_type: 'performance_improvement',
    },
  };
};
