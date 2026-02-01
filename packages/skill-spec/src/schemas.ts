import { z } from 'zod';
import { ResponsibilityLevel } from './responsibility';
import { PIIPolicySchema } from './pii-policy';
import { LLMPolicySchema } from './llm-policy';

/**
 * 実行状態スキーマ
 */
export const ExecutionStateSchema = z.enum([
  'CREATED',
  'PENDING_APPROVAL',
  'APPROVED',
  'BUDGET_RESERVED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'TIMEOUT',
  'CANCELLED',
  'ROLLED_BACK',
]);

/**
 * 実行者タイプスキーマ
 */
export const ExecutorTypeSchema = z.enum(['user', 'agent', 'system']);

/**
 * リクエスト元スキーマ
 */
export const RequestOriginSchema = z.enum(['api', 'scheduled', 'triggered', 'manual']);

/**
 * コストモデルスキーマ
 */
export const CostModelSchema = z.object({
  fixed_cost: z.number().min(0).default(0),
  per_token_input: z.number().min(0).default(0.003),
  per_token_output: z.number().min(0).default(0.015),
  estimated_tokens_input: z.number().int().positive().optional(),
  estimated_tokens_output: z.number().int().positive().optional(),
});

/**
 * 安全設定スキーマ
 */
export const SafetyConfigSchema = z.object({
  requires_approval: z.boolean().default(true),
  timeout_seconds: z.number().int().positive().default(300),
  max_retries: z.number().int().min(0).default(0),
  retry_delay_seconds: z.number().int().min(0).default(5),
});

/**
 * 入力定義スキーマ
 */
export const SkillInputSchema = z.object({
  schema: z.record(z.unknown()),
  examples: z.array(z.record(z.unknown())).optional(),
});

/**
 * 出力定義スキーマ
 */
export const SkillOutputSchema = z.object({
  schema: z.record(z.unknown()),
  examples: z.array(z.record(z.unknown())).optional(),
});

/**
 * スキル仕様スキーマ
 */
export const SkillSpecSchema = z.object({
  key: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/, {
      message: 'Key must be lowercase with dots (e.g., "crm.customer.search")',
    }),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, {
    message: 'Version must be semver format (e.g., "1.0.0")',
  }),
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(1000),
  category: z.string().min(1),
  tags: z.array(z.string()).default([]),
  input: SkillInputSchema,
  output: SkillOutputSchema,
  cost_model: CostModelSchema,
  safety: SafetyConfigSchema,
  pii_policy: PIIPolicySchema,
  llm_policy: LLMPolicySchema,
  has_external_effect: z.boolean().default(false),
  required_responsibility_level: z.nativeEnum(ResponsibilityLevel).default(ResponsibilityLevel.HUMAN_APPROVED),
});

/**
 * 承認チェーンエントリスキーマ
 */
export const ApprovalChainEntrySchema = z.object({
  approver_user_id: z.string().uuid(),
  approved_at: z.string().datetime(),
  scope: z.string(),
});

/**
 * 実行コンテキストスキーマ
 */
export const ExecutionContextSchema = z.object({
  execution_id: z.string().uuid().optional(),
  idempotency_key: z.string().uuid(),
  tenant_id: z.string().uuid(),
  skill_key: z.string(),
  skill_version: z.string().optional(),
  input: z.record(z.unknown()),
  executor_type: ExecutorTypeSchema,
  executor_id: z.string().uuid(),
  legal_responsible_user_id: z.string().uuid(),
  responsibility_level: z.nativeEnum(ResponsibilityLevel),
  approval_chain: z.array(ApprovalChainEntrySchema).default([]),
  trace_id: z.string().uuid(),
  request_origin: RequestOriginSchema,
  parent_execution_id: z.string().uuid().optional(),
});

/**
 * スキル実行結果スキーマ
 */
export const SkillResultSchema = z.object({
  output: z.record(z.unknown()),
  actual_cost: z.number().min(0),
  tokens_used: z
    .object({
      input: z.number().int().min(0),
      output: z.number().int().min(0),
    })
    .optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * 実行結果スキーマ
 */
export const ExecutionResultSchema = z.object({
  execution_id: z.string().uuid(),
  idempotency_key: z.string().uuid(),
  state: ExecutionStateSchema,
  result_status: z.enum(['success', 'failure', 'partial']).optional(),
  result_summary: z.string().optional(),
  output: z.record(z.unknown()).optional(),
  error_code: z.string().optional(),
  error_message: z.string().optional(),
});

/**
 * スキル仕様の検証
 */
export function validateSkillSpec(spec: unknown) {
  return SkillSpecSchema.safeParse(spec);
}

/**
 * 実行コンテキストの検証
 */
export function validateExecutionContext(context: unknown) {
  return ExecutionContextSchema.safeParse(context);
}
