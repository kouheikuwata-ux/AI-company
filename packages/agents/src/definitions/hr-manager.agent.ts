/**
 * HR Manager Agent - 人事部長（AI事部門）
 *
 * 役割:
 * - スキルのライフサイクル管理（採用 = スキル追加）
 * - スキルの評価と改善提案
 * - スキルのオンボーディング/オフボーディング
 * - リクエスト受付と優先度付け
 *
 * この会社では「人材」=「スキル」
 * HR Manager = AI事部門の管理者
 */

import type { AgentSpec } from '../types';
import { AgentRole, Department, AgentCapability, AgentStatus } from '../types';

export const hrManagerAgent: AgentSpec = {
  id: 'a0000001-0000-0000-0000-000000000005',
  key: 'hr_manager',
  name: 'HR Manager Agent (AI Affairs)',
  description: 'スキルのライフサイクル管理を担当。スキル = 会社の能力資産。',

  role: AgentRole.HR_MANAGER,
  department: Department.AI_AFFAIRS,
  reports_to: 'coo',

  capabilities: [
    AgentCapability.MANAGE_SKILLS,
    AgentCapability.REVIEW_EXECUTION,
    AgentCapability.GENERATE_REPORT,
    AgentCapability.TRACK_METRICS,
    AgentCapability.COORDINATE_TASKS,
  ],

  allowed_skills: [
    'governance.execution-summary',
    'ai-affairs.skill-evaluation',
    'ai-affairs.skill-onboarding',
    'ai-affairs.request-intake',
    'ai-affairs.request-triage',
    'ai-affairs.skill-recommendation',
    'ai-affairs.skill-deprecation-check',
    'internal.summary.create',
  ],

  max_responsibility_level: 2,  // AI_WITH_REVIEW
  requires_human_approval_for: [
    'skill.publish',
    'skill.deprecate',
    'skill.delete',
    'request.reject',
  ],

  budget_scope: 'department',
  daily_budget_limit: 5.0,  // $5/day

  working_hours: {
    timezone: 'Asia/Tokyo',
    start_hour: 9,
    end_hour: 18,
    working_days: [1, 2, 3, 4, 5],
  },

  scheduled_tasks: [
    {
      task_key: 'daily-request-review',
      cron: '0 10 * * 1-5',  // 平日10時
      skill_key: 'ai-affairs.request-intake',
      default_input: {
        auto_triage: true,
      },
    },
    {
      task_key: 'weekly-skill-evaluation',
      cron: '0 14 * * 3',  // 毎週水曜14時
      skill_key: 'ai-affairs.skill-evaluation',
      default_input: {
        evaluation_type: 'performance',
        period: 'weekly',
      },
    },
    {
      task_key: 'monthly-deprecation-check',
      cron: '0 10 1 * *',  // 毎月1日10時
      skill_key: 'ai-affairs.skill-deprecation-check',
      default_input: {
        inactivity_threshold_days: 90,
        error_rate_threshold: 0.3,
      },
    },
  ],

  event_triggers: [
    {
      event_type: 'request.created',
      skill_key: 'ai-affairs.request-triage',
    },
    {
      event_type: 'skill.performance_degraded',
      skill_key: 'ai-affairs.skill-evaluation',
      condition: 'success_rate < 0.9',
    },
    {
      event_type: 'skill.version_published',
      skill_key: 'ai-affairs.skill-onboarding',
    },
  ],

  status: AgentStatus.ACTIVE,
  version: '1.0.0',
};
