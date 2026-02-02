/**
 * Agent Scheduled Tasks - Inngest Cron Functions
 *
 * エージェントの定期タスクをInngest cronで実行
 */

import { inngest } from '../client';
import { agentRegistry } from '@ai-company-os/agents';
import { v4 as uuidv4 } from 'uuid';

/**
 * システムテナントID（スケジュールタスク用）
 * 本番環境では環境変数から取得
 */
const SYSTEM_TENANT_ID = process.env.SYSTEM_TENANT_ID || '00000000-0000-0000-0000-000000000001';

/**
 * システム管理者ID（法的責任者）
 * 本番環境では環境変数から取得
 */
const SYSTEM_ADMIN_USER_ID = process.env.SYSTEM_ADMIN_USER_ID || '00000000-0000-0000-0000-000000000001';

// ============================================================
// CEO Agent Scheduled Tasks
// ============================================================

/**
 * CEO: 週次エグゼクティブサマリー
 * 毎週月曜9時
 */
export const ceoWeeklyExecutiveSummary = inngest.createFunction(
  {
    id: 'ceo-weekly-executive-summary',
    name: 'CEO Agent: 週次エグゼクティブサマリー',
  },
  { cron: '0 9 * * 1' },  // 毎週月曜9時 (JST)
  async ({ step }) => {
    const agent = agentRegistry.get('ceo');
    if (!agent) throw new Error('CEO agent not found');

    const taskConfig = agent.scheduled_tasks.find(t => t.task_key === 'weekly-executive-summary');
    if (!taskConfig) throw new Error('Task config not found');

    await step.sendEvent('execute-skill', {
      name: 'skill/execute.requested',
      data: {
        skill_key: taskConfig.skill_key,
        input: taskConfig.default_input || {},
        idempotency_key: `ceo-weekly-summary-${new Date().toISOString().split('T')[0]}`,
        executor_type: 'agent',
        executor_id: agent.id,
        legal_responsible_user_id: SYSTEM_ADMIN_USER_ID,
        responsibility_level: agent.max_responsibility_level,
        tenant_id: SYSTEM_TENANT_ID,
        trace_id: uuidv4(),
        request_origin: 'scheduled',
      },
    });

    return { status: 'triggered', agent: 'ceo', task: 'weekly-executive-summary' };
  }
);

/**
 * CEO: 日次例外チェック
 * 平日18時
 */
export const ceoDailyExceptionCheck = inngest.createFunction(
  {
    id: 'ceo-daily-exception-check',
    name: 'CEO Agent: 日次例外チェック',
  },
  { cron: '0 18 * * 1-5' },  // 平日18時 (JST)
  async ({ step }) => {
    const agent = agentRegistry.get('ceo');
    if (!agent) throw new Error('CEO agent not found');

    const taskConfig = agent.scheduled_tasks.find(t => t.task_key === 'daily-exception-check');
    if (!taskConfig) throw new Error('Task config not found');

    await step.sendEvent('execute-skill', {
      name: 'skill/execute.requested',
      data: {
        skill_key: taskConfig.skill_key,
        input: taskConfig.default_input || {},
        idempotency_key: `ceo-exception-${new Date().toISOString().split('T')[0]}`,
        executor_type: 'agent',
        executor_id: agent.id,
        legal_responsible_user_id: SYSTEM_ADMIN_USER_ID,
        responsibility_level: agent.max_responsibility_level,
        tenant_id: SYSTEM_TENANT_ID,
        trace_id: uuidv4(),
        request_origin: 'scheduled',
      },
    });

    return { status: 'triggered', agent: 'ceo', task: 'daily-exception-check' };
  }
);

// ============================================================
// CFO Agent Scheduled Tasks
// ============================================================

/**
 * CFO: 日次予算チェック
 * 平日9時
 */
export const cfoDailyBudgetCheck = inngest.createFunction(
  {
    id: 'cfo-daily-budget-check',
    name: 'CFO Agent: 日次予算チェック',
  },
  { cron: '0 9 * * 1-5' },  // 平日9時 (JST)
  async ({ step }) => {
    const agent = agentRegistry.get('cfo');
    if (!agent) throw new Error('CFO agent not found');

    const taskConfig = agent.scheduled_tasks.find(t => t.task_key === 'daily-budget-check');
    if (!taskConfig) throw new Error('Task config not found');

    await step.sendEvent('execute-skill', {
      name: 'skill/execute.requested',
      data: {
        skill_key: taskConfig.skill_key,
        input: taskConfig.default_input || {},
        idempotency_key: `cfo-budget-${new Date().toISOString().split('T')[0]}`,
        executor_type: 'agent',
        executor_id: agent.id,
        legal_responsible_user_id: SYSTEM_ADMIN_USER_ID,
        responsibility_level: agent.max_responsibility_level,
        tenant_id: SYSTEM_TENANT_ID,
        trace_id: uuidv4(),
        request_origin: 'scheduled',
      },
    });

    return { status: 'triggered', agent: 'cfo', task: 'daily-budget-check' };
  }
);

/**
 * CFO: 週次コストレポート
 * 毎週月曜10時
 */
export const cfoWeeklyCostReport = inngest.createFunction(
  {
    id: 'cfo-weekly-cost-report',
    name: 'CFO Agent: 週次コストレポート',
  },
  { cron: '0 10 * * 1' },  // 毎週月曜10時 (JST)
  async ({ step }) => {
    const agent = agentRegistry.get('cfo');
    if (!agent) throw new Error('CFO agent not found');

    const taskConfig = agent.scheduled_tasks.find(t => t.task_key === 'weekly-cost-report');
    if (!taskConfig) throw new Error('Task config not found');

    await step.sendEvent('execute-skill', {
      name: 'skill/execute.requested',
      data: {
        skill_key: taskConfig.skill_key,
        input: taskConfig.default_input || {},
        idempotency_key: `cfo-cost-${new Date().toISOString().split('T')[0]}`,
        executor_type: 'agent',
        executor_id: agent.id,
        legal_responsible_user_id: SYSTEM_ADMIN_USER_ID,
        responsibility_level: agent.max_responsibility_level,
        tenant_id: SYSTEM_TENANT_ID,
        trace_id: uuidv4(),
        request_origin: 'scheduled',
      },
    });

    return { status: 'triggered', agent: 'cfo', task: 'weekly-cost-report' };
  }
);

/**
 * CFO: 月次予算レビュー
 * 毎月1日9時
 */
export const cfoMonthlyBudgetReview = inngest.createFunction(
  {
    id: 'cfo-monthly-budget-review',
    name: 'CFO Agent: 月次予算レビュー',
  },
  { cron: '0 9 1 * *' },  // 毎月1日9時 (JST)
  async ({ step }) => {
    const agent = agentRegistry.get('cfo');
    if (!agent) throw new Error('CFO agent not found');

    const taskConfig = agent.scheduled_tasks.find(t => t.task_key === 'monthly-budget-review');
    if (!taskConfig) throw new Error('Task config not found');

    await step.sendEvent('execute-skill', {
      name: 'skill/execute.requested',
      data: {
        skill_key: taskConfig.skill_key,
        input: taskConfig.default_input || {},
        idempotency_key: `cfo-monthly-${new Date().toISOString().slice(0, 7)}`,
        executor_type: 'agent',
        executor_id: agent.id,
        legal_responsible_user_id: SYSTEM_ADMIN_USER_ID,
        responsibility_level: agent.max_responsibility_level,
        tenant_id: SYSTEM_TENANT_ID,
        trace_id: uuidv4(),
        request_origin: 'scheduled',
      },
    });

    return { status: 'triggered', agent: 'cfo', task: 'monthly-budget-review' };
  }
);

// ============================================================
// COO Agent Scheduled Tasks
// ============================================================

/**
 * COO: 朝会レポート
 * 平日9時
 */
export const cooMorningStandup = inngest.createFunction(
  {
    id: 'coo-morning-standup',
    name: 'COO Agent: 朝会レポート',
  },
  { cron: '0 9 * * 1-5' },  // 平日9時 (JST)
  async ({ step }) => {
    const agent = agentRegistry.get('coo');
    if (!agent) throw new Error('COO agent not found');

    const taskConfig = agent.scheduled_tasks.find(t => t.task_key === 'morning-standup');
    if (!taskConfig) throw new Error('Task config not found');

    await step.sendEvent('execute-skill', {
      name: 'skill/execute.requested',
      data: {
        skill_key: taskConfig.skill_key,
        input: taskConfig.default_input || {},
        idempotency_key: `coo-standup-${new Date().toISOString().split('T')[0]}`,
        executor_type: 'agent',
        executor_id: agent.id,
        legal_responsible_user_id: SYSTEM_ADMIN_USER_ID,
        responsibility_level: agent.max_responsibility_level,
        tenant_id: SYSTEM_TENANT_ID,
        trace_id: uuidv4(),
        request_origin: 'scheduled',
      },
    });

    return { status: 'triggered', agent: 'coo', task: 'morning-standup' };
  }
);

/**
 * COO: 午後ステータス確認
 * 平日15時
 */
export const cooAfternoonStatus = inngest.createFunction(
  {
    id: 'coo-afternoon-status',
    name: 'COO Agent: 午後ステータス確認',
  },
  { cron: '0 15 * * 1-5' },  // 平日15時 (JST)
  async ({ step }) => {
    const agent = agentRegistry.get('coo');
    if (!agent) throw new Error('COO agent not found');

    const taskConfig = agent.scheduled_tasks.find(t => t.task_key === 'afternoon-status');
    if (!taskConfig) throw new Error('Task config not found');

    await step.sendEvent('execute-skill', {
      name: 'skill/execute.requested',
      data: {
        skill_key: taskConfig.skill_key,
        input: taskConfig.default_input || {},
        idempotency_key: `coo-status-${new Date().toISOString().split('T')[0]}`,
        executor_type: 'agent',
        executor_id: agent.id,
        legal_responsible_user_id: SYSTEM_ADMIN_USER_ID,
        responsibility_level: agent.max_responsibility_level,
        tenant_id: SYSTEM_TENANT_ID,
        trace_id: uuidv4(),
        request_origin: 'scheduled',
      },
    });

    return { status: 'triggered', agent: 'coo', task: 'afternoon-status' };
  }
);

/**
 * COO: 週次オペレーションレビュー
 * 毎週金曜16時
 */
export const cooWeeklyOpsReview = inngest.createFunction(
  {
    id: 'coo-weekly-ops-review',
    name: 'COO Agent: 週次オペレーションレビュー',
  },
  { cron: '0 16 * * 5' },  // 毎週金曜16時 (JST)
  async ({ step }) => {
    const agent = agentRegistry.get('coo');
    if (!agent) throw new Error('COO agent not found');

    const taskConfig = agent.scheduled_tasks.find(t => t.task_key === 'weekly-ops-review');
    if (!taskConfig) throw new Error('Task config not found');

    await step.sendEvent('execute-skill', {
      name: 'skill/execute.requested',
      data: {
        skill_key: taskConfig.skill_key,
        input: taskConfig.default_input || {},
        idempotency_key: `coo-weekly-${new Date().toISOString().split('T')[0]}`,
        executor_type: 'agent',
        executor_id: agent.id,
        legal_responsible_user_id: SYSTEM_ADMIN_USER_ID,
        responsibility_level: agent.max_responsibility_level,
        tenant_id: SYSTEM_TENANT_ID,
        trace_id: uuidv4(),
        request_origin: 'scheduled',
      },
    });

    return { status: 'triggered', agent: 'coo', task: 'weekly-ops-review' };
  }
);

// ============================================================
// CTO Agent Scheduled Tasks
// ============================================================

/**
 * CTO: 朝のヘルスチェック
 * 毎日8時
 */
export const ctoMorningHealthCheck = inngest.createFunction(
  {
    id: 'cto-morning-health-check',
    name: 'CTO Agent: システム健全性チェック',
  },
  { cron: '0 8 * * *' },  // 毎日8時 (JST)
  async ({ step }) => {
    const agent = agentRegistry.get('cto');
    if (!agent) throw new Error('CTO agent not found');

    const taskConfig = agent.scheduled_tasks.find(t => t.task_key === 'morning-health-check');
    if (!taskConfig) throw new Error('Task config not found');

    await step.sendEvent('execute-skill', {
      name: 'skill/execute.requested',
      data: {
        skill_key: taskConfig.skill_key,
        input: taskConfig.default_input || {},
        idempotency_key: `cto-health-${new Date().toISOString().split('T')[0]}`,
        executor_type: 'agent',
        executor_id: agent.id,
        legal_responsible_user_id: SYSTEM_ADMIN_USER_ID,
        responsibility_level: agent.max_responsibility_level,
        tenant_id: SYSTEM_TENANT_ID,
        trace_id: uuidv4(),
        request_origin: 'scheduled',
      },
    });

    return { status: 'triggered', agent: 'cto', task: 'morning-health-check' };
  }
);

/**
 * CTO: スキルパフォーマンスレビュー
 * 平日11時
 */
export const ctoSkillPerformanceReview = inngest.createFunction(
  {
    id: 'cto-skill-performance-review',
    name: 'CTO Agent: スキルパフォーマンスレビュー',
  },
  { cron: '0 11 * * 1-5' },  // 平日11時 (JST)
  async ({ step }) => {
    const agent = agentRegistry.get('cto');
    if (!agent) throw new Error('CTO agent not found');

    const taskConfig = agent.scheduled_tasks.find(t => t.task_key === 'skill-performance-review');
    if (!taskConfig) throw new Error('Task config not found');

    await step.sendEvent('execute-skill', {
      name: 'skill/execute.requested',
      data: {
        skill_key: taskConfig.skill_key,
        input: taskConfig.default_input || {},
        idempotency_key: `cto-perf-${new Date().toISOString().split('T')[0]}`,
        executor_type: 'agent',
        executor_id: agent.id,
        legal_responsible_user_id: SYSTEM_ADMIN_USER_ID,
        responsibility_level: agent.max_responsibility_level,
        tenant_id: SYSTEM_TENANT_ID,
        trace_id: uuidv4(),
        request_origin: 'scheduled',
      },
    });

    return { status: 'triggered', agent: 'cto', task: 'skill-performance-review' };
  }
);

/**
 * CTO: 週次セキュリティスキャン
 * 毎週日曜6時
 */
export const ctoWeeklySecurityScan = inngest.createFunction(
  {
    id: 'cto-weekly-security-scan',
    name: 'CTO Agent: 週次セキュリティスキャン',
  },
  { cron: '0 6 * * 0' },  // 毎週日曜6時 (JST)
  async ({ step }) => {
    const agent = agentRegistry.get('cto');
    if (!agent) throw new Error('CTO agent not found');

    const taskConfig = agent.scheduled_tasks.find(t => t.task_key === 'weekly-security-scan');
    if (!taskConfig) throw new Error('Task config not found');

    await step.sendEvent('execute-skill', {
      name: 'skill/execute.requested',
      data: {
        skill_key: taskConfig.skill_key,
        input: taskConfig.default_input || {},
        idempotency_key: `cto-security-${new Date().toISOString().split('T')[0]}`,
        executor_type: 'agent',
        executor_id: agent.id,
        legal_responsible_user_id: SYSTEM_ADMIN_USER_ID,
        responsibility_level: agent.max_responsibility_level,
        tenant_id: SYSTEM_TENANT_ID,
        trace_id: uuidv4(),
        request_origin: 'scheduled',
      },
    });

    return { status: 'triggered', agent: 'cto', task: 'weekly-security-scan' };
  }
);

/**
 * CTO: 週次改善提案
 * 毎週金曜14時
 */
export const ctoWeeklyImprovementProposals = inngest.createFunction(
  {
    id: 'cto-weekly-improvement-proposals',
    name: 'CTO Agent: 週次改善提案',
  },
  { cron: '0 14 * * 5' },  // 毎週金曜14時 (JST)
  async ({ step }) => {
    const agent = agentRegistry.get('cto');
    if (!agent) throw new Error('CTO agent not found');

    const taskConfig = agent.scheduled_tasks.find(t => t.task_key === 'weekly-improvement-proposals');
    if (!taskConfig) throw new Error('Task config not found');

    await step.sendEvent('execute-skill', {
      name: 'skill/execute.requested',
      data: {
        skill_key: taskConfig.skill_key,
        input: taskConfig.default_input || {},
        idempotency_key: `cto-improve-${new Date().toISOString().split('T')[0]}`,
        executor_type: 'agent',
        executor_id: agent.id,
        legal_responsible_user_id: SYSTEM_ADMIN_USER_ID,
        responsibility_level: agent.max_responsibility_level,
        tenant_id: SYSTEM_TENANT_ID,
        trace_id: uuidv4(),
        request_origin: 'scheduled',
      },
    });

    return { status: 'triggered', agent: 'cto', task: 'weekly-improvement-proposals' };
  }
);

// ============================================================
// Export all scheduled task functions
// ============================================================

export const agentScheduledTaskFunctions = [
  // CEO
  ceoWeeklyExecutiveSummary,
  ceoDailyExceptionCheck,
  // CFO
  cfoDailyBudgetCheck,
  cfoWeeklyCostReport,
  cfoMonthlyBudgetReview,
  // COO
  cooMorningStandup,
  cooAfternoonStatus,
  cooWeeklyOpsReview,
  // CTO
  ctoMorningHealthCheck,
  ctoSkillPerformanceReview,
  ctoWeeklySecurityScan,
  ctoWeeklyImprovementProposals,
];
