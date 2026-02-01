-- ============================================================
-- System Self-Diagnosis Logs
-- システム自己診断結果の永続化
-- ============================================================

-- トリガータイプ
CREATE TYPE diagnosis_trigger_type AS ENUM ('cron', 'ci', 'manual');

-- ============================================================
-- System Self-Diagnosis Logs Table
-- ============================================================

CREATE TABLE system_self_diagnosis_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- トリガー情報
  trigger_type diagnosis_trigger_type NOT NULL,
  system_version TEXT NOT NULL,

  -- サマリー統計
  issues_total INT NOT NULL DEFAULT 0,
  issues_auto_fixed INT NOT NULL DEFAULT 0,
  issues_pending_approval INT NOT NULL DEFAULT 0,

  -- 詳細データ
  summary JSONB NOT NULL DEFAULT '[]'::jsonb,      -- 問題一覧（簡易）
  full_report JSONB NOT NULL DEFAULT '{}'::jsonb  -- 完全レポート
);

-- インデックス
CREATE INDEX idx_diagnosis_created ON system_self_diagnosis_logs(created_at DESC);
CREATE INDEX idx_diagnosis_trigger ON system_self_diagnosis_logs(trigger_type);
CREATE INDEX idx_diagnosis_issues ON system_self_diagnosis_logs(issues_total) WHERE issues_total > 0;

-- コメント
COMMENT ON TABLE system_self_diagnosis_logs IS 'システム自己診断の実行結果を記録';
COMMENT ON COLUMN system_self_diagnosis_logs.trigger_type IS '診断のトリガー種別（cron/ci/manual）';
COMMENT ON COLUMN system_self_diagnosis_logs.system_version IS '診断時のシステムバージョン';
COMMENT ON COLUMN system_self_diagnosis_logs.issues_total IS '検出された問題の総数';
COMMENT ON COLUMN system_self_diagnosis_logs.issues_auto_fixed IS '自動修正された問題数';
COMMENT ON COLUMN system_self_diagnosis_logs.issues_pending_approval IS '承認待ちの問題数';
COMMENT ON COLUMN system_self_diagnosis_logs.summary IS '問題の簡易一覧（UI表示用）';
COMMENT ON COLUMN system_self_diagnosis_logs.full_report IS '完全な診断レポート（デバッグ用）';

-- ============================================================
-- Row Level Security
-- ============================================================
-- RLS有効化: anon/authenticated はアクセス不可
-- service_role はRLSをバイパスするため書き込み可能

ALTER TABLE system_self_diagnosis_logs ENABLE ROW LEVEL SECURITY;

-- ポリシーなし = 全拒否（service_roleのみバイパス可能）
