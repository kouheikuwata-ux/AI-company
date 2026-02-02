# AI Company OS - エージェントとスキル

## 概要

AI Company OSでは、**エージェント**が会社の役職を担い、**スキル**が業務タスクを実行します。

```
┌─────────────────────────────────────────────────────────────┐
│                      Human CEO                              │
│                   (最終意思決定者)                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      CEO Agent                              │
│               (戦略材料準備・例外対応)                        │
└─────────────────────────────────────────────────────────────┘
         │                  │                  │
         ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│   CFO Agent   │  │   COO Agent   │  │   CTO Agent   │
│  (財務・予算)  │  │(オペレーション)│  │ (技術・改善)   │
└───────────────┘  └───────────────┘  └───────────────┘
        │                  │                  │
        ▼                  │                  ▼
┌───────────────┐          │          ┌───────────────┐
│    Analyst    │          │          │    Auditor    │
│  (データ分析)  │          │          │   (監査役)    │
└───────────────┘          │          └───────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                                   ▼
┌───────────────────┐             ┌───────────────────┐
│   HR Manager      │             │   CS Manager      │
│   (AI事部門)       │             │ (カスタマー成功)   │
└───────────────────┘             └───────────────────┘
```

## エージェント一覧

### C-Suite (経営層)

| Agent | Key | 役割 | 使用スキル |
|-------|-----|------|-----------|
| CEO Agent | `ceo` | 戦略的意思決定の補助材料準備 | decision-brief, execution-summary |
| CFO Agent | `cfo` | 予算監視・コスト分析 | budget-insight, cost-analysis |
| COO Agent | `coo` | 業務オペレーション調整 | daily-standup, weekly-review |
| CTO Agent | `cto` | システム健全性・技術改善 | system-health, improvement-proposal |

### 部門長

| Agent | Key | 役割 | 使用スキル |
|-------|-----|------|-----------|
| HR Manager | `hr_manager` | スキル管理（AI事部門） | skill-evaluation, request-intake |
| CS Manager | `cs_manager` | 顧客フィードバック分析 | feedback-analysis, usage-pattern |

### スタッフ

| Agent | Key | 役割 | 使用スキル |
|-------|-----|------|-----------|
| Analyst | `analyst` | データ分析・レポート | daily-metrics, anomaly-detection |
| Auditor | `auditor` | コンプライアンス・監査 | compliance-check, log-review |

## スキル一覧

### 実装済み (16スキル)

| Key | 名前 | カテゴリ | 責任レベル |
|-----|------|---------|-----------|
| `governance.execution-summary` | 実行サマリーレポート | governance | HUMAN_APPROVED |
| `governance.decision-brief` | 意思決定ブリーフ | governance | HUMAN_DIRECT |
| `governance.budget-insight` | 予算インサイト | governance | HUMAN_APPROVED |
| `operations.daily-standup` | 朝会レポート | operations | AI_WITH_REVIEW |
| `operations.weekly-review` | 週次オペレーションレビュー | operations | AI_WITH_REVIEW |
| `engineering.system-health` | システム健全性 | engineering | AI_INTERNAL_ONLY |
| `finance.cost-analysis` | コスト分析レポート | finance | AI_WITH_REVIEW |
| `audit.compliance-check` | コンプライアンスチェック | audit | AI_WITH_REVIEW |
| `ai-affairs.skill-evaluation` | スキル評価 | ai-affairs | HUMAN_APPROVED |
| `ai-affairs.skill-deprecation-check` | スキル廃止チェック | ai-affairs | AI_WITH_REVIEW |
| `ai-affairs.request-intake` | スキル追加リクエスト | ai-affairs | HUMAN_APPROVED |
| `ai-affairs.performance-improvement` | パフォーマンス改善提案 | ai-affairs | AI_WITH_REVIEW |
| `cs.feedback-analysis` | フィードバック分析 | cs | AI_WITH_REVIEW |
| `cs.usage-pattern` | 利用パターン分析 | cs | AI_WITH_REVIEW |
| `cs.satisfaction-report` | 満足度レポート | cs | AI_WITH_REVIEW |
| `internal.summary.create` | テキスト要約 | internal | AI_INTERNAL_ONLY |

## 責任レベル

| レベル | 説明 | 承認 |
|--------|------|------|
| HUMAN_DIRECT (0) | 人間が直接実行 | 必須 |
| HUMAN_APPROVED (1) | 人間の承認後にAI実行 | 必須 |
| AI_WITH_REVIEW (2) | AI実行、人間レビュー | 推奨 |
| AI_INTERNAL_ONLY (3) | AI自律実行 | 不要 |

## 定期タスク

### 毎日
- 08:00 - CTO: システム健全性チェック
- 09:00 - COO: 朝会レポート生成
- 09:00 - CFO: 予算チェック
- 15:00 - COO: ワークフローステータス確認

### 毎週
- 月曜 09:00 - CEO: 週次エグゼクティブサマリー
- 月曜 10:00 - CFO: コストレポート
- 金曜 14:00 - CTO: 改善提案生成
- 金曜 16:00 - COO: 週次オペレーションレビュー

## 使用方法

### エージェントの取得

```typescript
import { agentRegistry } from '@ai-company-os/agents';

// 特定のエージェント取得
const ceoAgent = agentRegistry.get('ceo');

// 部門別取得
const financeAgents = agentRegistry.getByDepartment('finance');

// 能力別取得
const reportingAgents = agentRegistry.getByCapability('generate_report');
```

### スキルの実行

```typescript
import { initializeRegistry } from '@ai-company-os/skills';

const registry = initializeRegistry();
const skill = registry.get('operations.daily-standup');

const result = await skill.execute(
  { include_blockers: true, language: 'ja' },
  context
);
```

## 設計原則

1. **人間責任原則**: すべての実行に人間の法的責任者が必要
2. **事実重視**: エージェントは判断せず、事実と材料のみを提供
3. **段階的自律**: 責任レベルに応じた承認フロー
4. **監査可能性**: すべての実行と決定が追跡可能
5. **予算統制**: コスト予測と上限管理

## Inngest Cron統合

エージェントの定期タスクはInngest cronジョブとして自動実行されます。

### 登録されているcronジョブ

| Agent | タスク | スケジュール | スキル |
|-------|--------|------------|--------|
| CEO | 週次エグゼクティブサマリー | 月曜9時 | governance.execution-summary |
| CEO | 日次例外チェック | 平日18時 | operations.exception-handler |
| CFO | 日次予算チェック | 平日9時 | governance.budget-insight |
| CFO | 週次コストレポート | 月曜10時 | finance.cost-analysis |
| CFO | 月次予算レビュー | 毎月1日9時 | governance.budget-insight |
| COO | 朝会レポート | 平日9時 | operations.daily-standup |
| COO | 午後ステータス | 平日15時 | operations.workflow-status |
| COO | 週次オペレーションレビュー | 金曜16時 | operations.weekly-review |
| CTO | システムヘルスチェック | 毎日8時 | engineering.system-health |
| CTO | スキルパフォーマンスレビュー | 平日11時 | engineering.skill-performance |
| CTO | 週次セキュリティスキャン | 日曜6時 | engineering.security-scan |
| CTO | 週次改善提案 | 金曜14時 | engineering.improvement-proposal |
| HR Manager | 日次リクエストレビュー | 平日10時 | ai-affairs.request-intake |
| HR Manager | 週次スキル評価 | 水曜14時 | ai-affairs.skill-evaluation |
| HR Manager | 週次改善提案 | 金曜15時 | ai-affairs.performance-improvement |
| HR Manager | 月次廃止チェック | 毎月1日10時 | ai-affairs.skill-deprecation-check |
| CS Manager | 日次フィードバックサマリー | 平日17時 | cs.feedback-analysis |
| CS Manager | 週次利用レポート | 月曜11時 | cs.usage-pattern |
| CS Manager | 月次満足度レポート | 毎月1日10時 | cs.satisfaction-report |

### Inngestダッシュボード

開発環境では `npx inngest-cli dev` でローカルダッシュボードを起動できます。

本番環境では [Inngest Cloud](https://inngest.com) でジョブの監視・管理が可能です。

### イベント駆動

cronに加えて、24種類のイベントでもスキルが自動実行されます：

| カテゴリ | イベント | 対象エージェント |
|----------|----------|-----------------|
| 予算/コスト | `budget.threshold_warning`, `budget.threshold_exceeded` | CFO |
| | `cost.anomaly_detected`, `execution.cost_spike` | CFO |
| システム | `system.error_spike`, `skill.latency_degradation` | CTO |
| | `security.vulnerability_detected`, `deployment.failed` | CTO |
| 顧客 | `feedback.negative`, `usage.anomaly`, `user.churn_risk` | CS Manager |
| 監査 | `security.suspicious_activity`, `policy.violation_detected` | Auditor |
| | `pii.detected_in_logs`, `permission.elevated` | Auditor |
| 分析 | `metrics.threshold_breach`, `report.requested` | Analyst |
| HR | `request.created`, `skill.performance_degraded` | HR Manager |
| | `skill.version_published` | HR Manager |
| オペレーション | `workflow.blocked`, `task.overdue` | COO |
| | `execution.failure_rate_high` | COO |
| エスカレーション | `escalation.critical` | CEO |

### エージェント間通信

`AgentCommunicationService` を使用してエージェント間のメッセージングとエスカレーションが可能：

```typescript
import { createCommunicationService, agentRegistry } from '@ai-company-os/agents';

const comm = createCommunicationService(registry, sendEvent);

// メッセージ送信
await comm.sendMessage({
  from_agent: 'coo',
  to_agent: 'ceo',
  type: 'request',
  subject: '承認リクエスト',
  body: { ... },
});

// エスカレーション（報告先チェーンを辿る）
await comm.escalate({
  from_agent: 'analyst',
  reason: 'exception',
  context: { ... },
  urgency: 'today',
});
```

## 次のステップ

1. ~~残りのスキルの実装~~ ✅ 16スキル実装完了
2. ~~エージェントのスケジューラー統合 (Inngest Cron)~~ ✅ 19タスク完了
3. ~~エージェント間通信の実装~~ ✅ AgentCommunicationService 完了
4. ダッシュボードUIへのエージェント状態表示
5. ~~イベントトリガーのInngest統合~~ ✅ 24イベント対応完了
