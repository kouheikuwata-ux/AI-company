/**
 * CS Manager Agent - カスタマーサクセス部長
 *
 * 役割:
 * - 顧客（ユーザー）からのフィードバック収集
 * - 利用パターンの分析
 * - 改善要望の整理と提案
 * - ユーザー満足度のモニタリング
 *
 * 注意: 顧客対応の最終決定は人間が行う
 */

import type { AgentSpec } from '../types';
import { AgentRole, Department, AgentCapability, AgentStatus } from '../types';

export const csManagerAgent: AgentSpec = {
  id: 'a0000001-0000-0000-0000-000000000006',
  key: 'cs-manager',
  name: 'CS Manager Agent',
  description: '顧客フィードバックと利用分析を担当。顧客対応決定は人間が行う。',

  role: AgentRole.CS_MANAGER,
  department: Department.CUSTOMER_SUCCESS,
  reports_to: 'coo',

  capabilities: [
    AgentCapability.ANALYZE_DATA,
    AgentCapability.GENERATE_REPORT,
    AgentCapability.TRACK_METRICS,
    AgentCapability.SUMMARIZE_OPTIONS,
    AgentCapability.SEND_NOTIFICATION,
  ],

  allowed_skills: [
    'governance.execution-summary',
    'cs.feedback-analysis',
    'cs.usage-pattern',
    'cs.improvement-requests',
    'cs.satisfaction-report',
    'cs.user-journey-analysis',
    'internal.summary.create',
  ],

  max_responsibility_level: 2,  // AI_WITH_REVIEW
  requires_human_approval_for: [
    'feedback.respond',
    'user.contact',
  ],

  budget_scope: 'department',
  daily_budget_limit: 3.0,  // $3/day

  working_hours: {
    timezone: 'Asia/Tokyo',
    start_hour: 9,
    end_hour: 18,
    working_days: [1, 2, 3, 4, 5],
  },

  scheduled_tasks: [
    {
      task_key: 'daily-feedback-summary',
      cron: '0 17 * * 1-5',  // 平日17時
      skill_key: 'cs.feedback-analysis',
      default_input: {
        period: 'daily',
        categorize: true,
      },
    },
    {
      task_key: 'weekly-usage-report',
      cron: '0 11 * * 1',  // 毎週月曜11時
      skill_key: 'cs.usage-pattern',
      default_input: {
        period: 'weekly',
        include_trends: true,
      },
    },
    {
      task_key: 'monthly-satisfaction-report',
      cron: '0 10 1 * *',  // 毎月1日10時
      skill_key: 'cs.satisfaction-report',
      default_input: {
        include_nps: true,
        include_recommendations: false,  // 推奨はしない
      },
    },
  ],

  event_triggers: [
    {
      event_type: 'feedback.negative',
      skill_key: 'cs.feedback-analysis',
      condition: 'sentiment_score < 0.3',
    },
    {
      event_type: 'usage.anomaly',
      skill_key: 'cs.usage-pattern',
    },
    {
      event_type: 'user.churn_risk',
      skill_key: 'cs.user-journey-analysis',
      condition: 'risk_score > 0.7',
    },
  ],

  status: AgentStatus.ACTIVE,
  version: '1.0.0',
};
