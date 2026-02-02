/**
 * COO Agent - 最高執行責任者
 *
 * 役割:
 * - 日常業務のオーケストレーション
 * - ワークフローの管理と最適化
 * - 部門間の調整
 * - オペレーション効率のモニタリング
 *
 * 注意: 新ワークフローの導入は人間COOが承認
 */

import type { AgentSpec } from '../types';
import { AgentRole, Department, AgentCapability, AgentStatus } from '../types';

export const cooAgent: AgentSpec = {
  id: 'a0000001-0000-0000-0000-000000000003',
  key: 'coo',
  name: 'COO Agent',
  description: '業務オペレーションの調整とワークフロー管理を担当。',

  role: AgentRole.COO,
  department: Department.OPERATIONS,
  reports_to: 'ceo',

  capabilities: [
    AgentCapability.EXECUTE_WORKFLOW,
    AgentCapability.COORDINATE_TASKS,
    AgentCapability.TRACK_METRICS,
    AgentCapability.GENERATE_REPORT,
    AgentCapability.SEND_NOTIFICATION,
  ],

  allowed_skills: [
    'governance.execution-summary',
    'operations.daily-standup',
    'operations.weekly-review',
    'operations.workflow-status',
    'operations.task-coordinator',
    'operations.exception-handler',
    'internal.summary.create',
  ],

  max_responsibility_level: 2,  // AI_WITH_REVIEW
  requires_human_approval_for: [
    'workflow.create',
    'workflow.modify',
    'task.reassign_critical',
  ],

  budget_scope: 'department',
  daily_budget_limit: 10.0,  // $10/day

  working_hours: {
    timezone: 'Asia/Tokyo',
    start_hour: 8,
    end_hour: 19,
    working_days: [1, 2, 3, 4, 5],
  },

  scheduled_tasks: [
    {
      task_key: 'morning-standup',
      cron: '0 9 * * 1-5',  // 平日9時
      skill_key: 'operations.daily-standup',
      default_input: {
        include_blockers: true,
        include_metrics: true,
      },
    },
    {
      task_key: 'afternoon-status',
      cron: '0 15 * * 1-5',  // 平日15時
      skill_key: 'operations.workflow-status',
      default_input: {
        check_delays: true,
      },
    },
    {
      task_key: 'weekly-ops-review',
      cron: '0 16 * * 5',  // 毎週金曜16時
      skill_key: 'operations.weekly-review',
      default_input: {
        include_improvements: true,
      },
    },
  ],

  event_triggers: [
    {
      event_type: 'workflow.blocked',
      skill_key: 'operations.exception-handler',
    },
    {
      event_type: 'task.overdue',
      skill_key: 'operations.task-coordinator',
      condition: 'hours_overdue > 4',
    },
    {
      event_type: 'execution.failure_rate_high',
      skill_key: 'governance.execution-summary',
      condition: 'failure_rate > 0.1',
    },
  ],

  status: AgentStatus.ACTIVE,
  version: '1.0.0',
};
