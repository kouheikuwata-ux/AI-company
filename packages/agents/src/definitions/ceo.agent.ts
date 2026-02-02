/**
 * CEO Agent - 最高経営責任者
 *
 * 役割:
 * - 戦略的意思決定の補助材料を準備
 * - 例外事項のエスカレーション対応
 * - 週次経営レビューの準備
 * - 全社横断の重要事項の監視
 *
 * 注意: CEOエージェントは「決定」せず「材料を整理」するのみ
 * 最終決定は常に人間のCEOが行う
 */

import type { AgentSpec } from '../types';
import { AgentRole, Department, AgentCapability, AgentStatus } from '../types';

export const ceoAgent: AgentSpec = {
  id: 'a0000001-0000-0000-0000-000000000001',
  key: 'ceo',
  name: 'CEO Agent',
  description: '経営判断の材料準備と例外対応を担当。決定は人間CEOが行う。',

  role: AgentRole.CEO,
  department: Department.EXECUTIVE,
  reports_to: undefined,  // トップなので上司なし

  capabilities: [
    AgentCapability.PREPARE_DECISION,
    AgentCapability.SUMMARIZE_OPTIONS,
    AgentCapability.ASSESS_RISK,
    AgentCapability.GENERATE_REPORT,
    AgentCapability.DETECT_ANOMALY,
  ],

  allowed_skills: [
    'governance.decision-brief',
    'governance.execution-summary',
    'governance.budget-insight',
    'operations.weekly-review',
    'operations.exception-handler',
    'internal.summary.create',
  ],

  max_responsibility_level: 1,  // HUMAN_APPROVED - 全て人間承認必要
  requires_human_approval_for: ['*'],  // 全アクションに承認必要

  budget_scope: 'unlimited',
  daily_budget_limit: undefined,

  working_hours: {
    timezone: 'Asia/Tokyo',
    start_hour: 8,
    end_hour: 20,
    working_days: [1, 2, 3, 4, 5],
  },

  scheduled_tasks: [
    {
      task_key: 'weekly-executive-summary',
      cron: '0 9 * * 1',  // 毎週月曜9時
      skill_key: 'governance.execution-summary',
      default_input: {
        summary_type: 'weekly',
        language: 'ja',
      },
    },
    {
      task_key: 'daily-exception-check',
      cron: '0 18 * * 1-5',  // 平日18時
      skill_key: 'operations.exception-handler',
      default_input: {
        check_type: 'daily',
      },
    },
  ],

  event_triggers: [
    {
      event_type: 'escalation.critical',
      skill_key: 'governance.decision-brief',
      condition: 'urgency == "immediate"',
    },
    {
      event_type: 'budget.threshold_exceeded',
      skill_key: 'governance.budget-insight',
      condition: 'exceeded_percent > 90',
    },
  ],

  status: AgentStatus.ACTIVE,
  version: '1.0.0',
};
