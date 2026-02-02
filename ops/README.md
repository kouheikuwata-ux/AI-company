# Ops - システム運用チェック

システムの健全性チェックと問題検出の自動化ツール群です。

## 概要

```
ops/
├── check/
│   └── run-checks.ts    # チェック実行スクリプト
├── report/
│   └── summarize.ts     # レポート生成スクリプト
├── reports/
│   ├── run.json         # 最新のチェック結果
│   ├── latest.json      # 前回のチェック結果（比較用）
│   └── summary.json     # サマリーレポート
└── README.md
```

## 使用方法

### 1. チェックの実行

```bash
npm run ops:check
```

実行内容:
- `npm run self-check` の実行
- `skill-deprecation-check` の実行（DB接続）
- 結果を `ops/reports/run.json` に保存
- 前回の `run.json` を `latest.json` として保存

必要な環境変数:
- `SUPABASE_URL`: Supabase プロジェクト URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase サービスロールキー
- `TENANT_ID`: テナント ID（オプション）

### 2. レポートの生成

```bash
npm run ops:report
```

実行内容:
- `run.json` を読み込み
- `latest.json` との比較で regression を検出
- P0/P1/P2 に分類して出力
- 改善提案を生成
- `summary.json` として保存

### 3. 定期実行（推奨）

CI/CD や cron で定期的に実行:

```bash
# 毎日実行
npm run ops:check && npm run ops:report
```

## 優先度の定義

| 優先度 | 説明 | 対応目安 |
|--------|------|----------|
| P0 | クリティカル | 即時対応 |
| P1 | 高優先度 | 24時間以内 |
| P2 | 中優先度 | 次回スプリント |

## 検出される問題

### self-check 関連
- ビルドエラー
- 型エラー
- 設定ファイルの不整合

### skill-deprecation-check 関連
- 90日以上未使用のスキル
- エラー率30%以上のスキル
- コスト効率が低いスキル

## Regression 検出

`latest.json` と `run.json` を比較し、以下を検出:
- 前回成功 → 今回失敗（P0 regression）
- 新しい廃止候補スキルの出現
- 問題の解決（improvement として報告）

## 出力例

```
╔════════════════════════════════════════════════════════════╗
║                    OPS REPORT SUMMARY                      ║
╚════════════════════════════════════════════════════════════╝

Generated: 2024-01-15T10:00:00.000Z
Run timestamp: 2024-01-15T09:55:00.000Z
Overall Health: 🟢 HEALTHY

─────────────────────────────────────────────────────────────
NEXT ACTIONS
─────────────────────────────────────────────────────────────

✅ All systems healthy. No immediate action required.
```

## トラブルシューティング

### "run.json not found" エラー

```bash
# 先にチェックを実行
npm run ops:check
```

### "SUPABASE_SERVICE_ROLE_KEY not set" エラー

環境変数を設定:
```bash
export SUPABASE_URL="https://xxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-key"
npm run ops:check
```

または `.env` ファイルに設定。
