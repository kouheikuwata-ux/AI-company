// Re-export generated types (will be created by Supabase CLI)
// For now, export placeholder types

import type { ExecutionState, ExecutorType, ResultStatus } from '@ai-company-os/skill-spec';

// Re-export Database type from generated types
export type { Database, Json } from './generated/database.types';

/**
 * テナント
 */
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * ユーザー（Supabase Auth拡張）
 */
export interface User {
  id: string;
  email: string;
  tenant_id: string;
  role: 'owner' | 'admin' | 'member';
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * スキル
 */
export interface Skill {
  id: string;
  tenant_id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  is_active: boolean;
  active_version_id: string | null;
  fallback_version_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * スキルバージョン
 */
export interface SkillVersion {
  id: string;
  skill_id: string;
  version: string;
  spec: Record<string, unknown>;
  handler_code: string | null;
  is_published: boolean;
  pii_policy: Record<string, unknown>;
  llm_policy: Record<string, unknown>;
  has_external_effect: boolean;
  required_responsibility_level: number;
  created_at: string;
  published_at: string | null;
}

/**
 * スキル実行
 */
export interface SkillExecution {
  id: string;
  idempotency_key: string;
  tenant_id: string;
  skill_id: string;
  skill_version_id: string;
  skill_key: string;
  skill_version: string;
  executor_type: ExecutorType;
  executor_id: string;
  legal_responsible_user_id: string;
  responsibility_level: number;
  approval_chain: Record<string, unknown>[];
  state: ExecutionState;
  previous_state: ExecutionState | null;
  state_changed_at: string;
  state_changed_by: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  budget_reserved_amount: number | null;
  budget_consumed_amount: number | null;
  budget_released: boolean;
  result_status: ResultStatus | null;
  result_summary: string | null;
  error_code: string | null;
  error_message: string | null;
  trace_id: string;
  parent_execution_id: string | null;
}

/**
 * 予算
 */
export interface Budget {
  id: string;
  tenant_id: string;
  scope_type: 'tenant' | 'skill' | 'user';
  scope_id: string | null;
  period_start: string;
  period_end: string;
  limit_amount: number;
  used_amount: number;
  reserved_amount: number;
  is_hard_limit: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * 予算予約
 */
export interface BudgetReservation {
  id: string;
  budget_id: string;
  execution_id: string | null;
  amount: number;
  actual_amount: number | null;
  status: 'reserved' | 'consumed' | 'released';
  created_at: string;
  consumed_at: string | null;
  released_at: string | null;
}

/**
 * 予算トランザクション
 */
export interface BudgetTransaction {
  id: string;
  budget_id: string;
  reservation_id: string | null;
  execution_id: string | null;
  amount: number;
  transaction_type: 'reserve' | 'consume' | 'release' | 'adjust';
  description: string | null;
  created_at: string;
}

/**
 * 承認リクエスト
 */
export interface ApprovalRequest {
  id: string;
  tenant_id: string;
  execution_id: string;
  requester_id: string;
  approver_id: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  scope: string;
  expires_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

/**
 * 監査ログ
 */
export interface AuditLog {
  id: string;
  tenant_id: string;
  action: string;
  actor_type: 'user' | 'agent' | 'system';
  actor_id: string;
  resource_type: string;
  resource_id: string;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

/**
 * 実行状態ログ
 */
export interface ExecutionStateLog {
  id: string;
  execution_id: string;
  from_state: ExecutionState;
  to_state: ExecutionState;
  actor_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/**
 * 診断トリガータイプ
 */
export type DiagnosisTriggerType = 'cron' | 'ci' | 'manual';

/**
 * 診断サマリーアイテム
 */
export interface DiagnosisSummaryItem {
  category: string;
  check: string;
  status: 'pass' | 'fail' | 'warn';
  message?: string;
  auto_fixed?: boolean;
  requires_approval?: boolean;
}

/**
 * 診断フルレポート
 */
export interface DiagnosisFullReport {
  started_at: string;
  completed_at: string;
  duration_ms: number;
  environment: {
    node_version: string;
    platform: string;
    cwd: string;
  };
  categories: {
    name: string;
    checks: {
      name: string;
      status: 'pass' | 'fail' | 'warn';
      detail?: string;
    }[];
  }[];
  totals: {
    passed: number;
    failed: number;
    warnings: number;
  };
}

/**
 * システム自己診断ログ
 */
export interface SystemSelfDiagnosisLog {
  id: string;
  created_at: string;
  trigger_type: DiagnosisTriggerType;
  system_version: string;
  issues_total: number;
  issues_auto_fixed: number;
  issues_pending_approval: number;
  summary: DiagnosisSummaryItem[];
  full_report: DiagnosisFullReport;
}
