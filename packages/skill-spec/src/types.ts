import { ResponsibilityLevel } from './responsibility';
import type { PIIPolicy } from './pii-policy';
import type { LLMPolicy } from './llm-policy';

/**
 * 実行状態（State Machine）
 */
export type ExecutionState =
  | 'CREATED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'BUDGET_RESERVED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'ROLLED_BACK';

/**
 * 実行者タイプ
 */
export type ExecutorType = 'user' | 'agent' | 'system';

/**
 * リクエスト元
 */
export type RequestOrigin = 'api' | 'scheduled' | 'triggered' | 'manual';

/**
 * 実行結果ステータス
 */
export type ResultStatus = 'success' | 'failure' | 'partial';

/**
 * コストモデル
 */
export interface CostModel {
  /** 固定コスト（USD） */
  fixed_cost: number;

  /** 入力トークン単価（USD per 1000 tokens） */
  per_token_input: number;

  /** 出力トークン単価（USD per 1000 tokens） */
  per_token_output: number;

  /** 予想入力トークン数 */
  estimated_tokens_input?: number;

  /** 予想出力トークン数 */
  estimated_tokens_output?: number;
}

/**
 * 安全設定
 */
export interface SafetyConfig {
  /** 承認必須 */
  requires_approval: boolean;

  /** タイムアウト（秒） */
  timeout_seconds: number;

  /** 最大リトライ回数 */
  max_retries: number;

  /** リトライ間隔（秒） */
  retry_delay_seconds: number;
}

/**
 * 入力定義
 */
export interface SkillInput {
  /** Zodスキーマ（JSON Schema互換） */
  schema: Record<string, unknown>;

  /** 入力例 */
  examples?: Record<string, unknown>[];
}

/**
 * 出力定義
 */
export interface SkillOutput {
  /** Zodスキーマ（JSON Schema互換） */
  schema: Record<string, unknown>;

  /** 出力例 */
  examples?: Record<string, unknown>[];
}

/**
 * スキル仕様
 */
export interface SkillSpec {
  /** スキルキー（ユニーク） */
  key: string;

  /** バージョン（semver） */
  version: string;

  /** 表示名 */
  name: string;

  /** 説明 */
  description: string;

  /** カテゴリ */
  category: string;

  /** タグ */
  tags: string[];

  /** 入力定義 */
  input: SkillInput;

  /** 出力定義 */
  output: SkillOutput;

  /** コストモデル */
  cost_model: CostModel;

  /** 安全設定 */
  safety: SafetyConfig;

  /** PIIポリシー */
  pii_policy: PIIPolicy;

  /** LLMポリシー */
  llm_policy: LLMPolicy;

  /** 外部影響フラグ */
  has_external_effect: boolean;

  /** 必要な責任レベル */
  required_responsibility_level: ResponsibilityLevel;
}

/**
 * 承認チェーンエントリ
 */
export interface ApprovalChainEntry {
  approver_user_id: string;
  approved_at: string;
  scope: string;
}

/**
 * 実行コンテキスト（すべての実行に必須）
 */
export interface ExecutionContext {
  /** 実行ID */
  execution_id?: string;

  /** 冪等性キー */
  idempotency_key: string;

  /** テナントID */
  tenant_id: string;

  /** スキルキー */
  skill_key: string;

  /** スキルバージョン */
  skill_version?: string;

  /** 入力データ */
  input: Record<string, unknown>;

  /** 実行者タイプ */
  executor_type: ExecutorType;

  /** 実行者ID */
  executor_id: string;

  /** 法的責任者（必ず人間・必須） */
  legal_responsible_user_id: string;

  /** 責任レベル */
  responsibility_level: ResponsibilityLevel;

  /** 承認チェーン */
  approval_chain: ApprovalChainEntry[];

  /** トレースID */
  trace_id: string;

  /** リクエスト元 */
  request_origin: RequestOrigin;

  /** 親実行ID（チェーン実行時） */
  parent_execution_id?: string;
}

/**
 * スキル実行結果
 */
export interface SkillResult {
  /** 出力データ */
  output: Record<string, unknown>;

  /** 実際のコスト */
  actual_cost: number;

  /** 使用トークン数 */
  tokens_used?: {
    input: number;
    output: number;
  };

  /** メタデータ */
  metadata?: Record<string, unknown>;
}

/**
 * 実行結果
 */
export interface ExecutionResult {
  /** 実行ID */
  execution_id: string;

  /** 冪等性キー */
  idempotency_key: string;

  /** 状態 */
  state: ExecutionState;

  /** 結果ステータス */
  result_status?: ResultStatus;

  /** 結果サマリー */
  result_summary?: string;

  /** 出力（成功時） */
  output?: Record<string, unknown>;

  /** エラーコード（失敗時） */
  error_code?: string;

  /** エラーメッセージ（失敗時） */
  error_message?: string;

  /** 消費した予算 */
  budget_consumed?: number;
}

/**
 * スキルハンドラー関数の型
 */
export type SkillHandler = (
  input: Record<string, unknown>,
  context: SkillContext
) => Promise<SkillResult>;

/**
 * スキル実行時のコンテキスト
 */
export interface SkillContext {
  /** 実行ID */
  execution_id: string;

  /** テナントID */
  tenant_id: string;

  /** トレースID */
  trace_id: string;

  /** ロガー */
  logger: SkillLogger;

  /** LLMクライアント */
  llm: LLMClient;
}

/**
 * スキルロガーインターフェース
 */
export interface SkillLogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

/**
 * LLMクライアントインターフェース
 */
export interface LLMClient {
  chat(params: LLMChatParams): Promise<LLMChatResponse>;
}

/**
 * LLMチャットパラメータ
 */
export interface LLMChatParams {
  model?: string;
  system?: string;
  messages: LLMMessage[];
  max_tokens?: number;
  temperature?: number;
}

/**
 * LLMメッセージ
 */
export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * LLMチャットレスポンス
 */
export interface LLMChatResponse {
  content: string;
  tokens_used: {
    input: number;
    output: number;
  };
  model: string;
}
