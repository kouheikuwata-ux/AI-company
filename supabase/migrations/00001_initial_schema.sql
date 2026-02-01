-- ============================================================
-- AI Company OS 初期スキーマ
-- v3.0 責任モデル対応版
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Enums
-- ============================================================

CREATE TYPE execution_state AS ENUM (
  'CREATED',
  'PENDING_APPROVAL',
  'APPROVED',
  'BUDGET_RESERVED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'TIMEOUT',
  'CANCELLED',
  'ROLLED_BACK'
);

CREATE TYPE executor_type AS ENUM ('user', 'agent', 'system');
CREATE TYPE result_status AS ENUM ('success', 'failure', 'partial');
CREATE TYPE budget_scope_type AS ENUM ('tenant', 'skill', 'user');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected', 'expired');
CREATE TYPE budget_transaction_type AS ENUM ('reserve', 'consume', 'release', 'adjust');
CREATE TYPE user_role AS ENUM ('owner', 'admin', 'member');

-- ============================================================
-- Tenants
-- ============================================================

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);

-- ============================================================
-- Users (extends Supabase Auth)
-- ============================================================

CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'member',
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);

-- ============================================================
-- Skills
-- ============================================================

CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  active_version_id UUID,
  fallback_version_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, key)
);

CREATE INDEX idx_skills_tenant ON skills(tenant_id);
CREATE INDEX idx_skills_key ON skills(key);
CREATE INDEX idx_skills_category ON skills(category);

-- ============================================================
-- Skill Versions
-- ============================================================

CREATE TABLE skill_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  spec JSONB NOT NULL,
  handler_code TEXT,
  is_published BOOLEAN NOT NULL DEFAULT false,
  pii_policy JSONB NOT NULL DEFAULT '{
    "input_contains_pii": false,
    "output_contains_pii": false,
    "pii_fields": [],
    "handling": "REJECT"
  }'::jsonb,
  llm_policy JSONB NOT NULL DEFAULT '{
    "training_opt_out": true,
    "data_retention_days": 0,
    "allowed_models": ["claude-sonnet-4-20250514"],
    "max_context_tokens": 100000
  }'::jsonb,
  has_external_effect BOOLEAN NOT NULL DEFAULT false,
  required_responsibility_level INT NOT NULL DEFAULT 1 CHECK (required_responsibility_level BETWEEN 0 AND 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  UNIQUE(skill_id, version),
  -- 外部影響スキルの制約
  CONSTRAINT external_effect_requires_approval CHECK (
    has_external_effect = false OR required_responsibility_level <= 1
  )
);

CREATE INDEX idx_skill_versions_skill ON skill_versions(skill_id);

-- Add foreign key constraints for skills
ALTER TABLE skills ADD CONSTRAINT fk_skills_active_version
  FOREIGN KEY (active_version_id) REFERENCES skill_versions(id);
ALTER TABLE skills ADD CONSTRAINT fk_skills_fallback_version
  FOREIGN KEY (fallback_version_id) REFERENCES skill_versions(id);

-- ============================================================
-- Skill Executions
-- ============================================================

CREATE TABLE skill_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  idempotency_key TEXT NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id),
  skill_version_id UUID NOT NULL REFERENCES skill_versions(id),
  skill_key TEXT NOT NULL,
  skill_version TEXT NOT NULL,

  -- 責任モデル（v3.0）
  executor_type executor_type NOT NULL,
  executor_id UUID NOT NULL,
  legal_responsible_user_id UUID NOT NULL REFERENCES auth.users(id),
  responsibility_level INT NOT NULL CHECK (responsibility_level BETWEEN 0 AND 3),
  approval_chain JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- 状態（State Machine）
  state execution_state NOT NULL DEFAULT 'CREATED',
  previous_state execution_state,
  state_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  state_changed_by UUID,

  -- 時間
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- コスト
  budget_reserved_amount NUMERIC(10,4),
  budget_consumed_amount NUMERIC(10,4),
  budget_released BOOLEAN DEFAULT false,

  -- 結果
  result_status result_status,
  result_summary TEXT,
  error_code TEXT,
  error_message TEXT,

  -- トレース
  trace_id TEXT NOT NULL,
  parent_execution_id UUID REFERENCES skill_executions(id),

  -- 冪等性制約
  UNIQUE(tenant_id, idempotency_key)
);

CREATE INDEX idx_executions_tenant ON skill_executions(tenant_id);
CREATE INDEX idx_executions_state ON skill_executions(state);
CREATE INDEX idx_executions_skill ON skill_executions(skill_id);
CREATE INDEX idx_executions_executor ON skill_executions(executor_id);
CREATE INDEX idx_executions_created ON skill_executions(created_at DESC);
CREATE INDEX idx_executions_trace ON skill_executions(trace_id);

-- ============================================================
-- Execution State Logs
-- ============================================================

CREATE TABLE execution_state_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  execution_id UUID NOT NULL REFERENCES skill_executions(id) ON DELETE CASCADE,
  from_state execution_state NOT NULL,
  to_state execution_state NOT NULL,
  actor_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_state_logs_execution ON execution_state_logs(execution_id);

-- ============================================================
-- Budgets
-- ============================================================

CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scope_type budget_scope_type NOT NULL DEFAULT 'tenant',
  scope_id UUID,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  limit_amount NUMERIC(10,4) NOT NULL,
  used_amount NUMERIC(10,4) NOT NULL DEFAULT 0,
  reserved_amount NUMERIC(10,4) NOT NULL DEFAULT 0,
  is_hard_limit BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end >= period_start)
);

CREATE INDEX idx_budgets_tenant ON budgets(tenant_id);
CREATE INDEX idx_budgets_period ON budgets(period_start, period_end);
CREATE INDEX idx_budgets_active ON budgets(is_active) WHERE is_active = true;

-- ============================================================
-- Budget Reservations
-- ============================================================

CREATE TABLE budget_reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  execution_id UUID REFERENCES skill_executions(id),
  amount NUMERIC(10,4) NOT NULL,
  actual_amount NUMERIC(10,4),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'consumed', 'released')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ
);

CREATE INDEX idx_reservations_budget ON budget_reservations(budget_id);
CREATE INDEX idx_reservations_execution ON budget_reservations(execution_id);
CREATE INDEX idx_reservations_status ON budget_reservations(status);

-- ============================================================
-- Budget Transactions
-- ============================================================

CREATE TABLE budget_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  reservation_id UUID REFERENCES budget_reservations(id),
  execution_id UUID REFERENCES skill_executions(id),
  amount NUMERIC(10,4) NOT NULL,
  transaction_type budget_transaction_type NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_budget ON budget_transactions(budget_id);
CREATE INDEX idx_transactions_created ON budget_transactions(created_at DESC);

-- ============================================================
-- Approval Requests
-- ============================================================

CREATE TABLE approval_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  execution_id UUID NOT NULL REFERENCES skill_executions(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL,
  approver_id UUID,
  status approval_status NOT NULL DEFAULT 'pending',
  scope TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_approvals_tenant ON approval_requests(tenant_id);
CREATE INDEX idx_approvals_execution ON approval_requests(execution_id);
CREATE INDEX idx_approvals_status ON approval_requests(status);
CREATE INDEX idx_approvals_expires ON approval_requests(expires_at);

-- ============================================================
-- Audit Logs
-- ============================================================

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor_type executor_type NOT NULL,
  actor_id UUID NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

-- ============================================================
-- State Transition Validation
-- ============================================================

CREATE TABLE execution_state_transitions (
  from_state execution_state NOT NULL,
  to_state execution_state NOT NULL,
  requires_actor BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (from_state, to_state)
);

INSERT INTO execution_state_transitions (from_state, to_state, requires_actor) VALUES
  ('CREATED', 'PENDING_APPROVAL', false),
  ('CREATED', 'APPROVED', true),
  ('CREATED', 'BUDGET_RESERVED', false),
  ('CREATED', 'CANCELLED', true),
  ('PENDING_APPROVAL', 'APPROVED', true),
  ('PENDING_APPROVAL', 'CANCELLED', true),
  ('APPROVED', 'BUDGET_RESERVED', false),
  ('APPROVED', 'CANCELLED', true),
  ('BUDGET_RESERVED', 'RUNNING', false),
  ('BUDGET_RESERVED', 'CANCELLED', true),
  ('RUNNING', 'COMPLETED', false),
  ('RUNNING', 'FAILED', false),
  ('RUNNING', 'TIMEOUT', false),
  ('FAILED', 'ROLLED_BACK', false),
  ('TIMEOUT', 'ROLLED_BACK', false);
