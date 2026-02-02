/**
 * Decision Engine - ルールベース判断エンジン
 *
 * LLM不要でエージェントが判断できるようにする
 * 各エージェントの役割に応じたルールを定義
 */

import type { AgentSpec, ScheduledTask, EventTrigger } from './types';
import type { SkillResult } from '@ai-company-os/skill-spec';

/**
 * 判断結果
 */
export interface Decision {
  shouldTakeAction: boolean;
  actions: DecisionAction[];
  analysis: string;
  reasoning: string;
  severity: 'info' | 'warning' | 'critical';
}

/**
 * 判断に基づくアクション
 */
export interface DecisionAction {
  type: 'execute_skill' | 'escalate' | 'notify' | 'log';
  skillKey?: string;
  input?: Record<string, unknown>;
  target?: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
}

/**
 * 判断ルール
 */
interface DecisionRule {
  name: string;
  condition: (output: Record<string, unknown>) => boolean;
  actions: DecisionAction[];
  analysis: string;
  reasoning: string;
  severity: 'info' | 'warning' | 'critical';
}

/**
 * スキル別の判断ルール定義
 */
const SKILL_RULES: Record<string, DecisionRule[]> = {
  // システム健全性チェックのルール
  'engineering.system-health': [
    {
      name: 'critical-status',
      condition: (output) => output.overall_status === 'critical',
      actions: [
        {
          type: 'escalate',
          target: 'ceo',
          message: 'システムがクリティカル状態です。即座の対応が必要です。',
          priority: 'high',
        },
        {
          type: 'notify',
          message: '【緊急】システム健全性がcriticalに低下',
          priority: 'high',
        },
      ],
      analysis: 'システムがクリティカル状態を検出。複数のコンポーネントで問題が発生しています。',
      reasoning: 'overall_status が critical のため、即座のエスカレーションが必要',
      severity: 'critical',
    },
    {
      name: 'degraded-status',
      condition: (output) => output.overall_status === 'degraded',
      actions: [
        {
          type: 'log',
          message: 'システムがdegraded状態です。監視を継続します。',
          priority: 'medium',
        },
      ],
      analysis: 'システムがdegraded状態。一部のコンポーネントで警告が出ています。',
      reasoning: 'overall_status が degraded のため、監視継続が必要',
      severity: 'warning',
    },
    {
      name: 'high-budget-utilization',
      condition: (output) => {
        const budget = output.checks as Record<string, unknown> | undefined;
        const budgetCheck = budget?.budget as Record<string, unknown> | undefined;
        return (budgetCheck?.utilization_percent as number) > 80;
      },
      actions: [
        {
          type: 'notify',
          target: 'cfo',
          message: '予算使用率が80%を超過しました。',
          priority: 'medium',
        },
      ],
      analysis: '予算使用率が高くなっています。月末までの予算配分を確認してください。',
      reasoning: '予算使用率 > 80% のため、CFOへの通知が必要',
      severity: 'warning',
    },
    {
      name: 'database-latency-high',
      condition: (output) => {
        const checks = output.checks as Record<string, unknown> | undefined;
        const dbCheck = checks?.database as Record<string, unknown> | undefined;
        return (dbCheck?.latency_ms as number) > 1000;
      },
      actions: [
        {
          type: 'log',
          message: 'データベースレイテンシが1秒を超過',
          priority: 'medium',
        },
      ],
      analysis: 'データベースのレイテンシが高くなっています。パフォーマンス調査を推奨。',
      reasoning: 'database.latency_ms > 1000ms のため、パフォーマンス監視が必要',
      severity: 'warning',
    },
    {
      name: 'skills-low-success-rate',
      condition: (output) => {
        const checks = output.checks as Record<string, unknown> | undefined;
        const skillsCheck = checks?.skills as Record<string, unknown> | undefined;
        return (skillsCheck?.avg_success_rate as number) < 0.9;
      },
      actions: [
        {
          type: 'execute_skill',
          skillKey: 'engineering.skill-performance',
          input: { period: 'last_24h' },
          message: 'スキル成功率低下の詳細分析を実行',
          priority: 'high',
        },
      ],
      analysis: 'スキルの平均成功率が90%を下回っています。詳細分析が必要です。',
      reasoning: 'avg_success_rate < 0.9 のため、追加分析スキルを実行',
      severity: 'warning',
    },
    {
      name: 'healthy-status',
      condition: (output) => output.overall_status === 'healthy',
      actions: [],
      analysis: 'システムは正常に稼働しています。問題は検出されませんでした。',
      reasoning: 'overall_status が healthy のため、追加アクション不要',
      severity: 'info',
    },
  ],

  // 予算インサイトのルール
  'governance.budget-insight': [
    {
      name: 'anomaly-detected',
      condition: (output) => {
        const anomalies = output.anomalies as unknown[] | undefined;
        return Array.isArray(anomalies) && anomalies.length > 0;
      },
      actions: [
        {
          type: 'escalate',
          target: 'cfo',
          message: '予算異常を検出しました。確認が必要です。',
          priority: 'high',
        },
      ],
      analysis: '予算使用パターンに異常が検出されました。',
      reasoning: 'anomalies配列に要素があるため、CFOへエスカレーション',
      severity: 'warning',
    },
    {
      name: 'budget-exceeded',
      condition: (output) => {
        const summary = output.summary as Record<string, unknown> | undefined;
        return (summary?.utilization_rate as number) > 100;
      },
      actions: [
        {
          type: 'escalate',
          target: 'ceo',
          message: '予算超過が発生しました。',
          priority: 'high',
        },
      ],
      analysis: '予算が超過しています。緊急の対応が必要です。',
      reasoning: 'utilization_rate > 100% のため、CEOへエスカレーション',
      severity: 'critical',
    },
  ],

  // 朝会レポートのルール
  'operations.daily-standup': [
    {
      name: 'blockers-exist',
      condition: (output) => {
        const blockers = output.blockers as unknown[] | undefined;
        return Array.isArray(blockers) && blockers.length > 0;
      },
      actions: [
        {
          type: 'notify',
          target: 'coo',
          message: 'ブロッカーが存在します。対応が必要です。',
          priority: 'high',
        },
      ],
      analysis: 'タスクにブロッカーが存在しています。',
      reasoning: 'blockers配列に要素があるため、COOへ通知',
      severity: 'warning',
    },
  ],

  // 実行サマリーのルール
  'governance.execution-summary': [
    {
      name: 'high-failure-rate',
      condition: (output) => {
        const stats = output.execution_stats as Record<string, unknown> | undefined;
        const total = (stats?.total as number) || 1;
        const failed = (stats?.failed as number) || 0;
        return (failed / total) > 0.1;
      },
      actions: [
        {
          type: 'execute_skill',
          skillKey: 'engineering.system-health',
          input: { check_depth: 'full' },
          message: '失敗率が高いためシステム健全性チェックを実行',
          priority: 'high',
        },
      ],
      analysis: 'スキル実行の失敗率が10%を超えています。',
      reasoning: '失敗率 > 10% のため、システム健全性チェックを実行',
      severity: 'warning',
    },
  ],
};

/**
 * デフォルトルール（スキル固有ルールがない場合）
 */
const DEFAULT_RULES: DecisionRule[] = [
  {
    name: 'default-success',
    condition: () => true,
    actions: [],
    analysis: 'スキル実行が完了しました。特別なアクションは不要です。',
    reasoning: 'デフォルトルール：問題なし',
    severity: 'info',
  },
];

/**
 * 判断エンジン
 */
export class DecisionEngine {
  private agent: AgentSpec;

  constructor(agent: AgentSpec) {
    this.agent = agent;
  }

  /**
   * スキル実行結果を分析して判断を下す
   */
  analyze(skillKey: string, result: SkillResult): Decision {
    const output = result.output as Record<string, unknown>;
    const rules = SKILL_RULES[skillKey] || DEFAULT_RULES;

    // ルールを順番に評価（最初にマッチしたルールを適用）
    for (const rule of rules) {
      try {
        if (rule.condition(output)) {
          // アクションをフィルタリング（許可されたスキルのみ）
          const filteredActions = rule.actions.filter((action) => {
            if (action.type === 'execute_skill' && action.skillKey) {
              return this.agent.allowed_skills.includes(action.skillKey);
            }
            return true;
          });

          return {
            shouldTakeAction: filteredActions.length > 0,
            actions: filteredActions,
            analysis: rule.analysis,
            reasoning: rule.reasoning,
            severity: rule.severity,
          };
        }
      } catch {
        // ルール評価エラーは無視して次のルールへ
        continue;
      }
    }

    // どのルールにもマッチしない場合
    return {
      shouldTakeAction: false,
      actions: [],
      analysis: 'スキル実行が完了しました。',
      reasoning: 'マッチするルールなし',
      severity: 'info',
    };
  }

  /**
   * 複数の結果を総合的に分析
   */
  analyzeMultiple(results: Array<{ skillKey: string; result: SkillResult }>): Decision {
    const decisions = results.map(({ skillKey, result }) =>
      this.analyze(skillKey, result)
    );

    // 最も重大な判断を優先
    const critical = decisions.find((d) => d.severity === 'critical');
    if (critical) return critical;

    const warning = decisions.find((d) => d.severity === 'warning');
    if (warning) return warning;

    // 全てのアクションを統合
    const allActions = decisions.flatMap((d) => d.actions);
    const allAnalysis = decisions.map((d) => d.analysis).join('\n');

    return {
      shouldTakeAction: allActions.length > 0,
      actions: allActions,
      analysis: allAnalysis,
      reasoning: '複数の結果を統合',
      severity: 'info',
    };
  }

  /**
   * イベントに基づいて判断
   */
  analyzeEvent(
    trigger: EventTrigger,
    eventData: Record<string, unknown>,
    result: SkillResult
  ): Decision {
    // まずスキル結果を分析
    const skillDecision = this.analyze(trigger.skill_key, result);

    // イベントタイプに基づく追加判断
    const eventDecision = this.analyzeEventType(trigger.event_type, eventData);

    // より重大な方を返す
    if (eventDecision.severity === 'critical' ||
        (eventDecision.severity === 'warning' && skillDecision.severity === 'info')) {
      return {
        ...eventDecision,
        actions: [...eventDecision.actions, ...skillDecision.actions],
      };
    }

    return skillDecision;
  }

  /**
   * イベントタイプ別の判断
   */
  private analyzeEventType(
    eventType: string,
    eventData: Record<string, unknown>
  ): Decision {
    switch (eventType) {
      case 'system.error_spike':
        return {
          shouldTakeAction: true,
          actions: [
            {
              type: 'escalate',
              target: 'cto',
              message: `エラースパイク検出: ${eventData.error_count}件`,
              priority: 'high',
            },
          ],
          analysis: 'システムでエラースパイクが検出されました。',
          reasoning: 'system.error_spike イベント発生',
          severity: 'critical',
        };

      case 'budget.threshold_exceeded':
        return {
          shouldTakeAction: true,
          actions: [
            {
              type: 'escalate',
              target: 'cfo',
              message: `予算閾値超過: ${eventData.exceeded_percent}%`,
              priority: 'high',
            },
          ],
          analysis: '予算閾値を超過しました。',
          reasoning: 'budget.threshold_exceeded イベント発生',
          severity: 'warning',
        };

      case 'security.vulnerability_detected':
        return {
          shouldTakeAction: true,
          actions: [
            {
              type: 'escalate',
              target: 'cto',
              message: 'セキュリティ脆弱性を検出',
              priority: 'high',
            },
          ],
          analysis: 'セキュリティ脆弱性が検出されました。',
          reasoning: 'security.vulnerability_detected イベント発生',
          severity: 'critical',
        };

      default:
        return {
          shouldTakeAction: false,
          actions: [],
          analysis: `イベント ${eventType} を受信`,
          reasoning: '未定義のイベントタイプ',
          severity: 'info',
        };
    }
  }

  /**
   * 判断結果のサマリーを生成
   */
  generateSummary(
    task: ScheduledTask,
    decision: Decision,
    results: SkillResult[]
  ): string {
    const lines: string[] = [
      `## ${this.agent.name} - ${task.task_key} 実行レポート`,
      '',
      `### 分析結果`,
      decision.analysis,
      '',
      `### 判断根拠`,
      decision.reasoning,
      '',
      `### 重要度: ${decision.severity.toUpperCase()}`,
      '',
    ];

    if (decision.actions.length > 0) {
      lines.push('### 実行アクション');
      decision.actions.forEach((action, i) => {
        lines.push(`${i + 1}. [${action.type}] ${action.message}`);
      });
      lines.push('');
    }

    if (results.length > 0) {
      lines.push('### スキル実行結果');
      results.forEach((r, i) => {
        const output = r.output as Record<string, unknown>;
        const status = output.overall_status || output.status || 'completed';
        lines.push(`${i + 1}. 状態: ${status}, コスト: $${r.actual_cost.toFixed(4)}`);
      });
    }

    return lines.join('\n');
  }
}

/**
 * カスタムルールを追加
 */
export function addCustomRule(skillKey: string, rule: DecisionRule): void {
  if (!SKILL_RULES[skillKey]) {
    SKILL_RULES[skillKey] = [];
  }
  // 先頭に追加（優先度が高い）
  SKILL_RULES[skillKey].unshift(rule);
}

/**
 * ルール一覧を取得
 */
export function getSkillRules(skillKey: string): DecisionRule[] {
  return SKILL_RULES[skillKey] || DEFAULT_RULES;
}
