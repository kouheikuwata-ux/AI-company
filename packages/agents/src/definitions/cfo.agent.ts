/**
 * CFO Agent - 最高財務責任者
 *
 * 役割:
 * - 予算の監視と異常検知
 * - コスト分析レポートの生成
 * - 財務的な意思決定材料の準備
 * - 予算超過アラートの発行
 *
 * 注意: 予算の承認・変更は人間CFOが行う
 */

import type { AgentSpec } from '../types';
import { AgentRole, Department, AgentCapability, AgentStatus } from '../types';

export const cfoAgent: AgentSpec = {
  id: 'a0000001-0000-0000-0000-000000000002',
  key: 'cfo',
  name: 'CFO Agent',
  description: '予算監視、コスト分析、財務レポートを担当。予算決定は人間CFOが行う。',

  role: AgentRole.CFO,
  department: Department.FINANCE,
  reports_to: 'ceo',

  capabilities: [
    AgentCapability.MANAGE_BUDGET,
    AgentCapability.ANALYZE_DATA,
    AgentCapability.GENERATE_REPORT,
    AgentCapability.DETECT_ANOMALY,
    AgentCapability.TRACK_METRICS,
  ],

  allowed_skills: [
    'governance.budget-insight',
    'governance.execution-summary',
    'finance.cost-analysis',
    'finance.budget-alert',
    'finance.forecast',
    'internal.summary.create',
  ],

  max_responsibility_level: 1,  // HUMAN_APPROVED
  requires_human_approval_for: [
    'budget.adjust',
    'budget.allocate',
  ],

  budget_scope: 'unlimited',
  daily_budget_limit: undefined,

  working_hours: {
    timezone: 'Asia/Tokyo',
    start_hour: 9,
    end_hour: 18,
    working_days: [1, 2, 3, 4, 5],
  },

  scheduled_tasks: [
    {
      task_key: 'daily-budget-check',
      cron: '0 9 * * 1-5',  // 平日9時
      skill_key: 'governance.budget-insight',
      default_input: {
        comparison_type: 'day_over_day',
        granularity: 'skill',
        language: 'ja',
      },
    },
    {
      task_key: 'weekly-cost-report',
      cron: '0 10 * * 1',  // 毎週月曜10時
      skill_key: 'finance.cost-analysis',
      default_input: {
        period: 'weekly',
        include_forecast: true,
      },
    },
    {
      task_key: 'monthly-budget-review',
      cron: '0 9 1 * *',  // 毎月1日9時
      skill_key: 'governance.budget-insight',
      default_input: {
        comparison_type: 'month_over_month',
        granularity: 'department',
        language: 'ja',
      },
    },
  ],

  event_triggers: [
    {
      event_type: 'budget.threshold_warning',
      skill_key: 'finance.budget-alert',
      condition: 'used_percent > 80',
    },
    {
      event_type: 'cost.anomaly_detected',
      skill_key: 'governance.budget-insight',
    },
    {
      event_type: 'execution.cost_spike',
      skill_key: 'finance.cost-analysis',
      condition: 'cost > expected_cost * 2',
    },
  ],

  status: AgentStatus.ACTIVE,
  version: '1.0.0',
};
