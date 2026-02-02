/**
 * Skill Metrics Service
 *
 * skill_executions テーブルから実行統計を取得する
 */

import type { TypedSupabaseClient } from '@ai-company-os/database';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any;

/**
 * スキル別メトリクス
 */
export interface SkillMetrics {
  skill_key: string;
  skill_name: string;
  version: string;

  // 使用統計
  usage: {
    total_executions: number;
    unique_users: number;
    unique_agents: number;
  };

  // パフォーマンス
  performance: {
    success_rate: number;
    avg_latency_ms: number;
    p95_latency_ms: number;
    error_count: number;
    timeout_count: number;
  };

  // コスト
  cost: {
    total_cost: number;
    avg_cost_per_execution: number;
  };

  // 最終使用日
  last_used_at: string | null;

  // 傾向（前期間との比較）
  trend: 'improving' | 'stable' | 'degrading';
}

/**
 * 期間指定
 */
export interface MetricsPeriod {
  start: Date;
  end: Date;
}

/**
 * メトリクスサービス
 */
export class SkillMetricsService {
  constructor(private readonly db: AnySupabaseClient) {}

  /**
   * 指定期間のスキルメトリクスを取得
   */
  async getMetrics(
    tenantId: string,
    period: MetricsPeriod,
    skillKeys?: string[]
  ): Promise<SkillMetrics[]> {
    // スキル一覧を取得
    let skillsQuery = this.db
      .from('skills')
      .select('id, key, name')
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    if (skillKeys && skillKeys.length > 0) {
      skillsQuery = skillsQuery.in('key', skillKeys);
    }

    const { data: skills, error: skillsError } = await skillsQuery;

    if (skillsError || !skills) {
      console.error('Failed to fetch skills:', skillsError);
      return [];
    }

    const metrics: SkillMetrics[] = [];

    for (const skill of skills) {
      const skillMetrics = await this.getSkillMetrics(
        tenantId,
        skill.id,
        skill.key,
        skill.name,
        period
      );
      metrics.push(skillMetrics);
    }

    return metrics;
  }

  /**
   * 単一スキルのメトリクスを取得
   */
  private async getSkillMetrics(
    tenantId: string,
    skillId: string,
    skillKey: string,
    skillName: string,
    period: MetricsPeriod
  ): Promise<SkillMetrics> {
    // 実行統計を取得
    const { data: executions, error: execError } = await this.db
      .from('skill_executions')
      .select(`
        id,
        state,
        executor_type,
        executor_id,
        legal_responsible_user_id,
        created_at,
        started_at,
        completed_at,
        budget_consumed_amount,
        result_status,
        skill_version
      `)
      .eq('tenant_id', tenantId)
      .eq('skill_id', skillId)
      .gte('created_at', period.start.toISOString())
      .lte('created_at', period.end.toISOString());

    if (execError) {
      console.error(`Failed to fetch executions for ${skillKey}:`, execError);
    }

    const execs = executions || [];
    const totalExecutions = execs.length;

    if (totalExecutions === 0) {
      return {
        skill_key: skillKey,
        skill_name: skillName,
        version: '1.0.0',
        usage: {
          total_executions: 0,
          unique_users: 0,
          unique_agents: 0,
        },
        performance: {
          success_rate: 1,
          avg_latency_ms: 0,
          p95_latency_ms: 0,
          error_count: 0,
          timeout_count: 0,
        },
        cost: {
          total_cost: 0,
          avg_cost_per_execution: 0,
        },
        last_used_at: null,
        trend: 'stable',
      };
    }

    // ユニークユーザー・エージェント数
    const userIds = new Set<string>();
    const agentIds = new Set<string>();
    execs.forEach((e: { executor_type: string; executor_id: string; legal_responsible_user_id: string }) => {
      if (e.executor_type === 'user') {
        userIds.add(e.executor_id);
      } else if (e.executor_type === 'agent') {
        agentIds.add(e.executor_id);
      }
      userIds.add(e.legal_responsible_user_id);
    });

    // 成功/失敗カウント
    const successCount = execs.filter(
      (e: { state: string }) => e.state === 'COMPLETED'
    ).length;
    const errorCount = execs.filter(
      (e: { state: string }) => e.state === 'FAILED'
    ).length;
    const timeoutCount = execs.filter(
      (e: { state: string }) => e.state === 'TIMEOUT'
    ).length;

    // レイテンシ計算
    const latencies: number[] = [];
    execs.forEach((e: { started_at: string | null; completed_at: string | null }) => {
      if (e.started_at && e.completed_at) {
        const start = new Date(e.started_at).getTime();
        const end = new Date(e.completed_at).getTime();
        if (end > start) {
          latencies.push(end - start);
        }
      }
    });

    const avgLatency = latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;

    // P95レイテンシ
    let p95Latency = 0;
    if (latencies.length > 0) {
      const sorted = [...latencies].sort((a, b) => a - b);
      const p95Index = Math.floor(sorted.length * 0.95);
      p95Latency = sorted[Math.min(p95Index, sorted.length - 1)];
    }

    // コスト計算
    const totalCost = execs.reduce(
      (sum: number, e: { budget_consumed_amount: number | null }) =>
        sum + (e.budget_consumed_amount || 0),
      0
    );

    // 最終使用日
    const sortedByDate = [...execs].sort(
      (a: { created_at: string }, b: { created_at: string }) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const lastUsedAt = sortedByDate[0]?.created_at || null;

    // バージョン（最新の実行から）
    const version = sortedByDate[0]?.skill_version || '1.0.0';

    // トレンド判定（前半と後半を比較）
    const trend = this.calculateTrend(execs, period);

    return {
      skill_key: skillKey,
      skill_name: skillName,
      version,
      usage: {
        total_executions: totalExecutions,
        unique_users: userIds.size,
        unique_agents: agentIds.size,
      },
      performance: {
        success_rate: totalExecutions > 0 ? successCount / totalExecutions : 1,
        avg_latency_ms: Math.round(avgLatency),
        p95_latency_ms: Math.round(p95Latency),
        error_count: errorCount,
        timeout_count: timeoutCount,
      },
      cost: {
        total_cost: Number(totalCost.toFixed(4)),
        avg_cost_per_execution: totalExecutions > 0
          ? Number((totalCost / totalExecutions).toFixed(4))
          : 0,
      },
      last_used_at: lastUsedAt,
      trend,
    };
  }

  /**
   * トレンド計算（前半と後半の成功率を比較）
   */
  private calculateTrend(
    executions: Array<{ created_at: string; state: string }>,
    period: MetricsPeriod
  ): 'improving' | 'stable' | 'degrading' {
    if (executions.length < 4) {
      return 'stable';
    }

    const midpoint = new Date(
      (period.start.getTime() + period.end.getTime()) / 2
    );

    const firstHalf = executions.filter(
      e => new Date(e.created_at) < midpoint
    );
    const secondHalf = executions.filter(
      e => new Date(e.created_at) >= midpoint
    );

    if (firstHalf.length === 0 || secondHalf.length === 0) {
      return 'stable';
    }

    const firstSuccessRate = firstHalf.filter(
      e => e.state === 'COMPLETED'
    ).length / firstHalf.length;
    const secondSuccessRate = secondHalf.filter(
      e => e.state === 'COMPLETED'
    ).length / secondHalf.length;

    const diff = secondSuccessRate - firstSuccessRate;

    if (diff > 0.05) return 'improving';
    if (diff < -0.05) return 'degrading';
    return 'stable';
  }

  /**
   * サマリー統計を取得
   */
  async getSummary(
    tenantId: string,
    period: MetricsPeriod
  ): Promise<{
    total_executions: number;
    success_rate: number;
    total_cost: number;
    avg_latency_ms: number;
    by_state: Record<string, number>;
    by_skill: Array<{ skill_key: string; count: number }>;
  }> {
    const { data: executions, error } = await this.db
      .from('skill_executions')
      .select('skill_key, state, budget_consumed_amount, started_at, completed_at')
      .eq('tenant_id', tenantId)
      .gte('created_at', period.start.toISOString())
      .lte('created_at', period.end.toISOString());

    if (error || !executions) {
      console.error('Failed to fetch execution summary:', error);
      return {
        total_executions: 0,
        success_rate: 0,
        total_cost: 0,
        avg_latency_ms: 0,
        by_state: {},
        by_skill: [],
      };
    }

    const total = executions.length;
    const successCount = executions.filter(
      (e: { state: string }) => e.state === 'COMPLETED'
    ).length;

    const byState: Record<string, number> = {};
    const bySkillMap = new Map<string, number>();

    let totalCost = 0;
    const latencies: number[] = [];

    executions.forEach((e: {
      state: string;
      skill_key: string;
      budget_consumed_amount: number | null;
      started_at: string | null;
      completed_at: string | null;
    }) => {
      byState[e.state] = (byState[e.state] || 0) + 1;
      bySkillMap.set(e.skill_key, (bySkillMap.get(e.skill_key) || 0) + 1);
      totalCost += e.budget_consumed_amount || 0;

      if (e.started_at && e.completed_at) {
        const start = new Date(e.started_at).getTime();
        const end = new Date(e.completed_at).getTime();
        if (end > start) {
          latencies.push(end - start);
        }
      }
    });

    const avgLatency = latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;

    const bySkill = Array.from(bySkillMap.entries())
      .map(([skill_key, count]) => ({ skill_key, count }))
      .sort((a, b) => b.count - a.count);

    return {
      total_executions: total,
      success_rate: total > 0 ? successCount / total : 0,
      total_cost: Number(totalCost.toFixed(4)),
      avg_latency_ms: Math.round(avgLatency),
      by_state: byState,
      by_skill: bySkill,
    };
  }
}
