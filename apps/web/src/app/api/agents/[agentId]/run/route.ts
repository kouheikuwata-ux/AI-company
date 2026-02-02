import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { agentRegistry, AgentRunner } from '@ai-company-os/agents';
import { initializeRegistry } from '@ai-company-os/skills';
import { v4 as uuidv4 } from 'uuid';
import {
  SkillExecutor,
  StateMachine,
  BudgetService,
  AuditLogger,
  PIIGuard,
  SkillMetricsService,
} from '@ai-company-os/runner';
import { createLLMClient } from '@/lib/llm/client';

const skillRegistry = initializeRegistry();

/**
 * リクエストスキーマ
 */
const RunAgentRequestSchema = z.object({
  task_key: z.string(),
  input_override: z.record(z.unknown()).optional(),
});

/**
 * POST /api/agents/[agentId]/run
 * エージェントのタスクを手動実行（ルールベース判断）
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { agentId: string } }
) {
  const agentId = params.agentId;

  try {
    // 1. 認証
    const supabase = createServerSupabaseClient();
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !authUser) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    // ユーザー情報取得
    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('id, tenant_id, role')
      .eq('id', authUser.id)
      .single();

    const user = userData as { id: string; tenant_id: string; role: string } | null;

    if (!user) {
      return NextResponse.json(
        { error: { code: 'USER_NOT_FOUND', message: 'User not found' } },
        { status: 404 }
      );
    }

    // 管理者のみ実行可能
    if (!['admin', 'owner'].includes(user.role)) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Admin access required' } },
        { status: 403 }
      );
    }

    // 2. リクエスト検証
    const body = await request.json();
    const parseResult = RunAgentRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: parseResult.error.errors,
          },
        },
        { status: 400 }
      );
    }

    // 3. エージェント取得
    const agent = agentRegistry.get(agentId);

    if (!agent) {
      return NextResponse.json(
        {
          error: {
            code: 'AGENT_NOT_FOUND',
            message: `Agent not found: ${agentId}`,
          },
        },
        { status: 404 }
      );
    }

    // 4. タスク取得
    const task = agent.scheduled_tasks.find(
      (t) => t.task_key === parseResult.data.task_key
    );

    if (!task) {
      return NextResponse.json(
        {
          error: {
            code: 'TASK_NOT_FOUND',
            message: `Task not found: ${parseResult.data.task_key}`,
            available_tasks: agent.scheduled_tasks.map((t) => t.task_key),
          },
        },
        { status: 404 }
      );
    }

    // 5. スキル実行関数を作成
    const traceId = uuidv4();
    const stateMachine = new StateMachine(adminClient);
    const budgetService = new BudgetService(adminClient);
    const auditLogger = new AuditLogger(adminClient);
    const piiGuard = new PIIGuard();
    const llmClient = createLLMClient();

    const executor = new SkillExecutor({
      db: adminClient,
      registry: skillRegistry,
      stateMachine,
      budgetService,
      auditLogger,
      piiGuard,
      llmClient,
    });

    // メトリクスサービス
    const metricsService = new SkillMetricsService(adminClient);

    const executeSkill = async (
      skillKey: string,
      input: Record<string, unknown>
    ) => {
      // AI Affairsスキルの場合、実データを注入
      let enrichedInput = { ...input };

      if (skillKey.startsWith('ai-affairs.')) {
        const now = new Date();
        const periodDays = (input.period === 'daily' ? 1 :
                          input.period === 'monthly' ? 30 : 7);
        const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

        // メトリクスを取得
        const metrics = await metricsService.getMetrics(
          user.tenant_id,
          { start: periodStart, end: now },
          input.skill_keys as string[] | undefined
        );

        // サマリーを取得
        const summary = await metricsService.getSummary(
          user.tenant_id,
          { start: periodStart, end: now }
        );

        // 実データを注入
        enrichedInput = {
          ...input,
          _metrics: {
            skills: metrics,
            summary,
            period: {
              start: periodStart.toISOString(),
              end: now.toISOString(),
              days: periodDays,
            },
          },
        };
      }

      const result = await executor.execute({
        tenant_id: user.tenant_id,
        skill_key: skillKey,
        input: enrichedInput,
        idempotency_key: uuidv4(),
        executor_type: 'agent',
        executor_id: agent.id,
        legal_responsible_user_id: user.id,
        responsibility_level: agent.max_responsibility_level,
        approval_chain: [],
        trace_id: traceId,
        request_origin: 'manual',
      });

      // ExecutionResultからSkillResultを取得
      return {
        output: result.output || {},
        actual_cost: result.budget_consumed || 0.005,
        metadata: {},
      };
    };

    // 6. エージェントランナーを作成・実行（ルールベース判断）
    const runner = new AgentRunner(agent, {
      tenantId: user.tenant_id,
      traceId,
      legalResponsibleUserId: user.id,
      executeSkill,
    });

    // 入力オーバーライドがあればタスクに適用
    const taskWithOverride = parseResult.data.input_override
      ? {
          ...task,
          default_input: {
            ...task.default_input,
            ...parseResult.data.input_override,
          },
        }
      : task;

    const result = await runner.runScheduledTask(taskWithOverride);

    // 7. 結果を返す
    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        role: agent.role,
      },
      task: task.task_key,
      result: {
        decisions: result.decisions.map((d) => ({
          severity: d.severity,
          analysis: d.analysis,
          reasoning: d.reasoning,
          shouldTakeAction: d.shouldTakeAction,
          actionsCount: d.actions.length,
        })),
        actionsExecuted: result.actionsExecuted.map((a) => ({
          type: a.type,
          message: a.message,
          priority: a.priority,
          skillKey: a.skillKey,
        })),
        skillResultsCount: result.skillResults.length,
        finalSummary: result.finalSummary,
        totalCost: result.totalCost,
      },
      trace_id: traceId,
    });
  } catch (error) {
    console.error('Agent run error:', error);

    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/agents/[agentId]/run
 * エージェントの実行可能なタスク一覧を取得
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { agentId: string } }
) {
  const agentId = params.agentId;

  const agent = agentRegistry.get(agentId);

  if (!agent) {
    return NextResponse.json(
      {
        error: {
          code: 'AGENT_NOT_FOUND',
          message: `Agent not found: ${agentId}`,
          available_agents: agentRegistry.getAll().map((a) => a.id),
        },
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    agent: {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      description: agent.description,
      max_responsibility_level: agent.max_responsibility_level,
    },
    scheduled_tasks: agent.scheduled_tasks.map((t) => ({
      task_key: t.task_key,
      description: t.description,
      skill_key: t.skill_key,
      cron: t.cron,
      default_input: t.default_input,
    })),
    event_triggers: agent.event_triggers.map((t) => ({
      event_type: t.event_type,
      skill_key: t.skill_key,
      condition: t.condition,
    })),
    allowed_skills: agent.allowed_skills,
  });
}
