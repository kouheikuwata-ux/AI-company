import { inngest } from '../client';
import { createAdminClient, setTenantContext } from '@/lib/supabase/admin';
import { SkillExecutor, StateMachine, BudgetService, AuditLogger, PIIGuard } from '@ai-company-os/runner';
import { initializeRegistry } from '@ai-company-os/skills';
import { createLLMClient } from '@/lib/llm/client';
import type { ExecutionResult } from '@ai-company-os/skill-spec';

/**
 * Internal スキルの外部実行ブロック結果を生成
 */
function createBlockedResult(
  idempotencyKey: string,
  skillKey: string
): ExecutionResult {
  return {
    execution_id: `blocked-${idempotencyKey}`,
    idempotency_key: idempotencyKey,
    state: 'FAILED',
    result_status: 'failure',
    error_code: 'INTERNAL_SKILL_BLOCKED',
    error_message: `Internal skill "${skillKey}" cannot be executed directly. Internal skills are only callable from other skills.`,
  };
}

/**
 * スキル実行ハンドラー（Inngest Function）
 */
export const handleSkillExecute = inngest.createFunction(
  {
    id: 'skill-execute',
    retries: 0, // リトライはState Machineで管理
    concurrency: {
      limit: 5, // Hobby plan limit
      key: 'event.data.tenant_id',
    },
  },
  { event: 'skill/execute.requested' },
  async ({ event, step }) => {
    const data = event.data;

    // 1. 依存注入
    const supabase = createAdminClient();
    await setTenantContext(supabase, data.tenant_id);

    const registry = initializeRegistry();
    const auditLogger = new AuditLogger(supabase);

    // 1.5 internalスキルの外部実行を禁止
    // - internalカテゴリは他スキルからの内部呼び出しのみ許可
    // - parent_execution_id がある場合は内部呼び出しと判断
    const skill = registry.get(data.skill_key);
    if (skill?.spec.category === 'internal') {
      const isInternalCall = !!data.parent_execution_id;
      if (!isInternalCall) {
        // 監査ログに記録（throw せずハンドリング）
        await auditLogger.log(data.tenant_id, {
          action: 'skill.execute.blocked',
          actor_type: data.executor_type,
          actor_id: data.executor_id,
          resource_type: 'skill',
          resource_id: data.skill_key,
          metadata: {
            reason: 'internal_skill_direct_execution',
            message: 'Blocked internal skill execution via Inngest (no parent_execution_id)',
            request_origin: data.request_origin || 'unknown',
            idempotency_key: data.idempotency_key,
            trace_id: data.trace_id,
          },
        });

        // ブロック結果を返却（throw しない）
        const blockedResult = createBlockedResult(data.idempotency_key, data.skill_key);

        // 完了イベント発火（FAILED として通知）
        await step.sendEvent('notify-blocked', {
          name: 'skill/execute.completed',
          data: {
            execution_id: blockedResult.execution_id,
            state: 'FAILED',
            tenant_id: data.tenant_id,
            blocked_reason: 'internal_skill_direct_execution',
          },
        });

        return blockedResult;
      }
    }

    const stateMachine = new StateMachine(supabase);
    const budgetService = new BudgetService(supabase);
    const piiGuard = new PIIGuard();
    const llmClient = createLLMClient();

    const executor = new SkillExecutor({
      db: supabase,
      registry,
      stateMachine,
      budgetService,
      auditLogger,
      piiGuard,
      llmClient,
    });

    // 2. 実行（冪等性はExecutor内で保証）
    const result = await executor.execute({
      tenant_id: data.tenant_id,
      skill_key: data.skill_key,
      input: data.input,
      idempotency_key: data.idempotency_key,
      executor_type: data.executor_type,
      executor_id: data.executor_id,
      legal_responsible_user_id: data.legal_responsible_user_id,
      responsibility_level: data.responsibility_level,
      approval_chain: [],
      trace_id: data.trace_id,
      request_origin: data.request_origin,
    });

    // 3. 完了イベント発火（Webhook通知等）
    if (result.state === 'COMPLETED' || result.state === 'FAILED') {
      await step.sendEvent('notify-completion', {
        name: 'skill/execute.completed',
        data: {
          execution_id: result.execution_id,
          state: result.state,
          tenant_id: data.tenant_id,
        },
      });
    }

    return result;
  }
);
