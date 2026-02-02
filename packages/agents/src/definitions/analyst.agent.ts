/**
 * Analyst Agent - アナリスト
 *
 * 役割:
 * - データ分析と可視化
 * - 定型レポートの自動生成
 * - メトリクスのトラッキング
 * - 異常値の検出と報告
 *
 * CFOの下で財務・業績データの分析を担当
 */

import type { AgentSpec } from '../types';
import { AgentRole, Department, AgentCapability, AgentStatus } from '../types';

export const analystAgent: AgentSpec = {
  id: 'a0000001-0000-0000-0000-000000000007',
  key: 'analyst',
  name: 'Analyst Agent',
  description: 'データ分析と定型レポート生成を担当。',

  role: AgentRole.ANALYST,
  department: Department.FINANCE,
  reports_to: 'cfo',

  capabilities: [
    AgentCapability.ANALYZE_DATA,
    AgentCapability.GENERATE_REPORT,
    AgentCapability.TRACK_METRICS,
    AgentCapability.DETECT_ANOMALY,
  ],

  allowed_skills: [
    'governance.execution-summary',
    'governance.budget-insight',
    'analytics.daily-metrics',
    'analytics.trend-analysis',
    'analytics.anomaly-detection',
    'analytics.cohort-analysis',
    'internal.summary.create',
  ],

  max_responsibility_level: 3,  // AI_INTERNAL_ONLY - 分析は自律実行可能
  requires_human_approval_for: [],  // 分析のみなので承認不要

  budget_scope: 'self',
  daily_budget_limit: 2.0,  // $2/day

  working_hours: {
    timezone: 'Asia/Tokyo',
    start_hour: 6,   // 早朝からレポート準備
    end_hour: 22,
    working_days: [0, 1, 2, 3, 4, 5, 6],  // 毎日
  },

  scheduled_tasks: [
    {
      task_key: 'morning-metrics',
      cron: '0 7 * * *',  // 毎日7時
      skill_key: 'analytics.daily-metrics',
      default_input: {
        metrics: ['executions', 'success_rate', 'latency', 'cost'],
      },
    },
    {
      task_key: 'hourly-anomaly-check',
      cron: '0 * * * *',  // 毎時
      skill_key: 'analytics.anomaly-detection',
      default_input: {
        sensitivity: 'medium',
      },
    },
    {
      task_key: 'weekly-trend',
      cron: '0 8 * * 1',  // 毎週月曜8時
      skill_key: 'analytics.trend-analysis',
      default_input: {
        period: 'weekly',
        compare_to: 'previous_week',
      },
    },
  ],

  event_triggers: [
    {
      event_type: 'metrics.threshold_breach',
      skill_key: 'analytics.anomaly-detection',
    },
    {
      event_type: 'report.requested',
      skill_key: 'governance.execution-summary',
    },
  ],

  status: AgentStatus.ACTIVE,
  version: '1.0.0',
};
