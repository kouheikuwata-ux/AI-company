# AI Company OS v3.0

**人間責任 + AI執行補助システム**

## コンセプト

AIは「提案・実行補助・自動化」を担う**ツール**であり、法的責任は常に人間が負います。重要決定・外部影響がある操作は人間承認を必須とし、AIの実行結果は人間がレビュー可能な形で記録されます。

## 技術スタック

- **Frontend**: Next.js 14 (App Router)
- **Backend**: Supabase (PostgreSQL + Auth)
- **Async Processing**: Inngest
- **LLM**: Anthropic Claude
- **Monorepo**: pnpm workspaces + Turborepo

## プロジェクト構成

```
ai-company-os/
├── apps/
│   └── web/                 # Next.js アプリケーション
├── packages/
│   ├── database/            # DB型定義・クライアント
│   ├── runner/              # Skill実行エンジン
│   ├── skill-spec/          # スキル仕様型定義
│   └── skills/              # スキル定義（Build-time Registry）
├── supabase/
│   └── migrations/          # DBマイグレーション
└── .github/
    └── workflows/           # CI/CD
```

## セットアップ

### 前提条件

- Node.js 20+
- pnpm 9+
- Supabase CLI
- Docker (ローカルSupabase用)

### インストール

```bash
# 依存関係インストール
pnpm install

# ローカルSupabase起動
supabase start

# 環境変数設定
cp .env.example .env.local
# .env.localを編集

# 開発サーバー起動
pnpm dev
```

## コマンド

```bash
# 開発
pnpm dev              # 開発サーバー
pnpm build            # ビルド（Registry生成含む）
pnpm test             # テスト
pnpm lint             # Lint

# データベース
pnpm db:generate      # 型生成
pnpm db:push          # マイグレーション

# スキル
pnpm skills:generate  # Registry生成
pnpm skills:validate  # スキル検証

# 運用チェック
pnpm ops:check        # システムチェック実行
pnpm ops:report       # レポート生成
```

## 運用チェック（ops）

システムの健全性を自動チェックし、問題を検出・レポートします。

```bash
# 1. チェック実行（結果を run.json に保存）
npm run ops:check

# 2. レポート生成（P0/P1/P2 分類で出力）
npm run ops:report
```

詳細は [ops/README.md](./ops/README.md) を参照してください。

## 設計原則（v3.0）

### 責任モデル

```
「AIがやった」は法的に存在しない

すべての実行には必ず：
├── executor（実行者）: agent_id or user_id
├── legal_responsible_user_id（法的責任者）: 必ず人間
└── approval_chain（承認チェーン）: 誰が承認したか
```

### 責任レベル

| Level | 名前 | 説明 |
|-------|------|------|
| 0 | HUMAN_DIRECT | 人間が直接実行 |
| 1 | HUMAN_APPROVED | 人間が承認してAIが実行 |
| 2 | AI_WITH_REVIEW | AIが実行し人間が事後レビュー |
| 3 | AI_INTERNAL_ONLY | AIが自動実行（内部処理のみ） |

### State Machine

```
CREATED
  ↓
PENDING_APPROVAL → APPROVED → BUDGET_RESERVED → RUNNING
  ↓                 ↓           ↓                 ↓
CANCELLED       CANCELLED   CANCELLED         COMPLETED / FAILED / TIMEOUT
                                                          ↓
                                                    ROLLED_BACK
```

## 環境変数

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# LLM
ANTHROPIC_API_KEY=

# Inngest
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# Optional
SLACK_WEBHOOK_URL=
SENTRY_DSN=
```

## ライセンス

Private - All rights reserved
