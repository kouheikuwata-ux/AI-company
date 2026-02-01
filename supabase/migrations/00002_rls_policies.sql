-- ============================================================
-- Row Level Security (RLS) Policies
-- v3.0 NULL即例外版
-- ============================================================

-- ============================================================
-- RLS Helper Functions
-- ============================================================

-- テナントID取得（NULL即例外）
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS UUID AS $$
DECLARE
  v_tenant_id UUID;
  v_claims JSONB;
BEGIN
  -- JWT claimsを安全に取得
  BEGIN
    v_claims := current_setting('request.jwt.claims', true)::jsonb;
  EXCEPTION WHEN OTHERS THEN
    v_claims := NULL;
  END;

  -- tenant_idを取得
  IF v_claims IS NOT NULL AND v_claims ? 'tenant_id' THEN
    v_tenant_id := (v_claims ->> 'tenant_id')::uuid;
  END IF;

  -- app設定からのフォールバック（service_role用）
  IF v_tenant_id IS NULL THEN
    BEGIN
      v_tenant_id := current_setting('app.tenant_id', true)::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_tenant_id := NULL;
    END;
  END IF;

  -- NULL即例外（v3.0）
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required. Ensure JWT contains tenant_id claim or set app.tenant_id';
  END IF;

  RETURN v_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- テナントコンテキスト設定（service_role用）
CREATE OR REPLACE FUNCTION set_tenant_context(p_tenant_id UUID)
RETURNS VOID AS $$
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id cannot be NULL';
  END IF;
  PERFORM set_config('app.tenant_id', p_tenant_id::text, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ユーザーID取得
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS UUID AS $$
BEGIN
  RETURN auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Enable RLS on all tables
-- ============================================================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_state_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Tenants Policies
-- ============================================================

CREATE POLICY tenant_select ON tenants
  FOR SELECT USING (id = get_current_tenant_id());

-- ============================================================
-- Users Policies
-- ============================================================

CREATE POLICY users_select ON users
  FOR SELECT USING (tenant_id = get_current_tenant_id());

CREATE POLICY users_update ON users
  FOR UPDATE USING (
    tenant_id = get_current_tenant_id()
    AND (id = get_current_user_id() OR EXISTS (
      SELECT 1 FROM users u WHERE u.id = get_current_user_id() AND u.role = 'owner'
    ))
  );

-- ============================================================
-- Skills Policies
-- ============================================================

CREATE POLICY skills_select ON skills
  FOR SELECT USING (tenant_id = get_current_tenant_id());

CREATE POLICY skills_insert ON skills
  FOR INSERT WITH CHECK (tenant_id = get_current_tenant_id());

CREATE POLICY skills_update ON skills
  FOR UPDATE USING (tenant_id = get_current_tenant_id());

CREATE POLICY skills_delete ON skills
  FOR DELETE USING (tenant_id = get_current_tenant_id());

-- ============================================================
-- Skill Versions Policies
-- ============================================================

CREATE POLICY skill_versions_select ON skill_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM skills s
      WHERE s.id = skill_versions.skill_id
      AND s.tenant_id = get_current_tenant_id()
    )
  );

CREATE POLICY skill_versions_insert ON skill_versions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM skills s
      WHERE s.id = skill_versions.skill_id
      AND s.tenant_id = get_current_tenant_id()
    )
  );

CREATE POLICY skill_versions_update ON skill_versions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM skills s
      WHERE s.id = skill_versions.skill_id
      AND s.tenant_id = get_current_tenant_id()
    )
  );

-- ============================================================
-- Skill Executions Policies
-- ============================================================

CREATE POLICY executions_select ON skill_executions
  FOR SELECT USING (tenant_id = get_current_tenant_id());

CREATE POLICY executions_insert ON skill_executions
  FOR INSERT WITH CHECK (tenant_id = get_current_tenant_id());

CREATE POLICY executions_update ON skill_executions
  FOR UPDATE USING (tenant_id = get_current_tenant_id());

-- ============================================================
-- Execution State Logs Policies
-- ============================================================

CREATE POLICY state_logs_select ON execution_state_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM skill_executions e
      WHERE e.id = execution_state_logs.execution_id
      AND e.tenant_id = get_current_tenant_id()
    )
  );

CREATE POLICY state_logs_insert ON execution_state_logs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM skill_executions e
      WHERE e.id = execution_state_logs.execution_id
      AND e.tenant_id = get_current_tenant_id()
    )
  );

-- ============================================================
-- Budgets Policies
-- ============================================================

CREATE POLICY budgets_select ON budgets
  FOR SELECT USING (tenant_id = get_current_tenant_id());

CREATE POLICY budgets_insert ON budgets
  FOR INSERT WITH CHECK (tenant_id = get_current_tenant_id());

CREATE POLICY budgets_update ON budgets
  FOR UPDATE USING (tenant_id = get_current_tenant_id());

-- ============================================================
-- Budget Reservations Policies
-- ============================================================

CREATE POLICY reservations_select ON budget_reservations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM budgets b
      WHERE b.id = budget_reservations.budget_id
      AND b.tenant_id = get_current_tenant_id()
    )
  );

CREATE POLICY reservations_insert ON budget_reservations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM budgets b
      WHERE b.id = budget_reservations.budget_id
      AND b.tenant_id = get_current_tenant_id()
    )
  );

CREATE POLICY reservations_update ON budget_reservations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM budgets b
      WHERE b.id = budget_reservations.budget_id
      AND b.tenant_id = get_current_tenant_id()
    )
  );

-- ============================================================
-- Budget Transactions Policies
-- ============================================================

CREATE POLICY transactions_select ON budget_transactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM budgets b
      WHERE b.id = budget_transactions.budget_id
      AND b.tenant_id = get_current_tenant_id()
    )
  );

CREATE POLICY transactions_insert ON budget_transactions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM budgets b
      WHERE b.id = budget_transactions.budget_id
      AND b.tenant_id = get_current_tenant_id()
    )
  );

-- ============================================================
-- Approval Requests Policies
-- ============================================================

CREATE POLICY approvals_select ON approval_requests
  FOR SELECT USING (tenant_id = get_current_tenant_id());

CREATE POLICY approvals_insert ON approval_requests
  FOR INSERT WITH CHECK (tenant_id = get_current_tenant_id());

CREATE POLICY approvals_update ON approval_requests
  FOR UPDATE USING (tenant_id = get_current_tenant_id());

-- ============================================================
-- Audit Logs Policies
-- ============================================================

CREATE POLICY audit_select ON audit_logs
  FOR SELECT USING (tenant_id = get_current_tenant_id());

CREATE POLICY audit_insert ON audit_logs
  FOR INSERT WITH CHECK (tenant_id = get_current_tenant_id());
