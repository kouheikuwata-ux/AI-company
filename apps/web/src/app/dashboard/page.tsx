import { initializeRegistry } from '@ai-company-os/skills';
import { agentRegistry } from '@ai-company-os/agents';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/auth/helpers';
import {
  AgentStatusCard,
  ExecutionTimeline,
  SkillStatsCard,
} from '@/components/dashboard';

// 動的レンダリング強制（最新ログを必ず反映）
export const dynamic = 'force-dynamic';

/** 7日間（ミリ秒） */
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** デフォルト予算限度額 */
const DEFAULT_BUDGET_LIMIT = 100;

// Build-time Registry（サーバーコンポーネントで直接参照）
const registry = initializeRegistry();

interface DiagnosisLog {
  id: string;
  created_at: string;
  trigger_type: string;
  system_version: string;
  issues_total: number;
  issues_auto_fixed: number;
  issues_pending_approval: number;
}

type FetchResult =
  | { success: true; logs: DiagnosisLog[] }
  | { success: false; error: string };

interface ExecutionMetrics {
  runningCount: number;
  pendingApprovalCount: number;
}

interface BudgetMetrics {
  usedAmount: number;
  limitAmount: number;
}

interface RecentExecution {
  id: string;
  skill_key: string;
  state: string;
  created_at: string;
  result_status: string | null;
}

interface PendingApproval {
  id: string;
  skill_key: string;
  created_at: string;
  executor_type: string;
}

/**
 * 実行メトリクス取得（実行中・承認待ち）
 */
async function fetchExecutionMetrics(): Promise<ExecutionMetrics> {
  try {
    const supabase = createAdminClient();

    // 実行中のスキル数
    const { count: runningCount } = await supabase
      .from('skill_executions')
      .select('*', { count: 'exact', head: true })
      .eq('state', 'RUNNING');

    // 承認待ちのスキル数
    const { count: pendingCount } = await supabase
      .from('skill_executions')
      .select('*', { count: 'exact', head: true })
      .eq('state', 'PENDING_APPROVAL');

    return {
      runningCount: runningCount || 0,
      pendingApprovalCount: pendingCount || 0,
    };
  } catch (err) {
    console.error('[Dashboard] Failed to fetch execution metrics:', err);
    return { runningCount: 0, pendingApprovalCount: 0 };
  }
}

/**
 * 今月の予算取得
 */
async function fetchBudgetMetrics(): Promise<BudgetMetrics> {
  try {
    const supabase = createAdminClient();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    // テナントレベルの予算を取得（アクティブで今月のもの）
    const { data } = await supabase
      .from('budgets')
      .select('used_amount, reserved_amount, limit_amount')
      .eq('scope_type', 'tenant')
      .eq('is_active', true)
      .gte('period_end', startOfMonth)
      .lte('period_start', endOfMonth)
      .limit(1)
      .single();

    // Supabaseの型推論制限のため、型アサーションを使用
    const budgetData = data as { used_amount: number; reserved_amount: number; limit_amount: number } | null;

    if (budgetData) {
      return {
        usedAmount: (budgetData.used_amount || 0) + (budgetData.reserved_amount || 0),
        limitAmount: budgetData.limit_amount ?? DEFAULT_BUDGET_LIMIT,
      };
    }

    return { usedAmount: 0, limitAmount: DEFAULT_BUDGET_LIMIT };
  } catch (err) {
    console.error('[Dashboard] Failed to fetch budget metrics:', err);
    return { usedAmount: 0, limitAmount: DEFAULT_BUDGET_LIMIT };
  }
}

/**
 * 最近の実行履歴取得
 */
async function fetchRecentExecutions(): Promise<RecentExecution[]> {
  try {
    const supabase = createAdminClient();

    const { data } = await supabase
      .from('skill_executions')
      .select('id, skill_key, state, created_at, result_status')
      .order('created_at', { ascending: false })
      .limit(5);

    return (data as RecentExecution[]) || [];
  } catch (err) {
    console.error('[Dashboard] Failed to fetch recent executions:', err);
    return [];
  }
}

/**
 * 承認キュー取得
 */
async function fetchPendingApprovals(): Promise<PendingApproval[]> {
  try {
    const supabase = createAdminClient();

    const { data } = await supabase
      .from('skill_executions')
      .select('id, skill_key, created_at, executor_type')
      .eq('state', 'PENDING_APPROVAL')
      .order('created_at', { ascending: true })
      .limit(5);

    return (data as PendingApproval[]) || [];
  } catch (err) {
    console.error('[Dashboard] Failed to fetch pending approvals:', err);
    return [];
  }
}

interface AgentStatus {
  key: string;
  name: string;
  role: string;
  department: string;
  status: 'active' | 'idle' | 'busy' | 'error';
  lastActivity?: string;
  currentTask?: string;
}

/**
 * エージェントステータス取得
 */
async function fetchAgentStatuses(): Promise<AgentStatus[]> {
  const agents = agentRegistry.getAll();
  const supabase = createAdminClient();

  // 各エージェントの最新の実行を取得
  const agentStatuses: AgentStatus[] = [];

  for (const agent of agents) {
    let status: 'active' | 'idle' | 'busy' | 'error' = 'idle';
    let lastActivity: string | undefined;
    let currentTask: string | undefined;

    try {
      // 実行中のタスクを確認
      const { data: runningExec } = await supabase
        .from('skill_executions')
        .select('skill_key, created_at')
        .eq('executor_id', agent.id)
        .eq('state', 'RUNNING')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (runningExec) {
        const execData = runningExec as { skill_key: string; created_at: string };
        status = 'busy';
        currentTask = execData.skill_key;
      } else {
        // 最新の完了済みタスクを確認
        const { data: lastExec } = await supabase
          .from('skill_executions')
          .select('completed_at, state')
          .eq('executor_id', agent.id)
          .in('state', ['COMPLETED', 'FAILED'])
          .order('completed_at', { ascending: false })
          .limit(1)
          .single();

        if (lastExec) {
          const execData = lastExec as { state: string; completed_at: string | null };
          status = execData.state === 'FAILED' ? 'error' : 'active';
          lastActivity = execData.completed_at || undefined;
        }
      }
    } catch {
      // エラーの場合はidle状態のまま
    }

    agentStatuses.push({
      key: agent.key,
      name: agent.name,
      role: agent.role,
      department: agent.department,
      status,
      lastActivity,
      currentTask,
    });
  }

  return agentStatuses;
}

interface SkillStat {
  skill_key: string;
  total: number;
  completed: number;
  failed: number;
  success_rate: number;
}

/**
 * スキル別統計取得
 */
async function fetchSkillStats(): Promise<SkillStat[]> {
  try {
    const supabase = createAdminClient();

    const { data } = await supabase
      .from('skill_executions')
      .select('skill_key, state');

    if (!data) return [];

    const skillMap = new Map<string, { total: number; completed: number; failed: number }>();

    for (const row of data) {
      const rowData = row as { skill_key: string; state: string };
      if (!skillMap.has(rowData.skill_key)) {
        skillMap.set(rowData.skill_key, { total: 0, completed: 0, failed: 0 });
      }
      const stats = skillMap.get(rowData.skill_key)!;
      stats.total++;
      if (rowData.state === 'COMPLETED') {
        stats.completed++;
      } else if (rowData.state === 'FAILED') {
        stats.failed++;
      }
    }

    return Array.from(skillMap.entries())
      .map(([skill_key, stats]) => ({
        skill_key,
        total: stats.total,
        completed: stats.completed,
        failed: stats.failed,
        success_rate: stats.total > 0
          ? Math.round((stats.completed / stats.total) * 100)
          : 0,
      }))
      .sort((a, b) => b.total - a.total);
  } catch (err) {
    console.error('[Dashboard] Failed to fetch skill stats:', err);
    return [];
  }
}

interface TimelineExecution {
  id: string;
  skill_key: string;
  state: string;
  created_at: string;
  completed_at?: string;
  result_status?: string;
  executor_type: string;
  executor_id: string;
}

/**
 * タイムライン用実行履歴取得（より詳細なデータ）
 */
async function fetchTimelineExecutions(): Promise<TimelineExecution[]> {
  try {
    const supabase = createAdminClient();

    const { data } = await supabase
      .from('skill_executions')
      .select('id, skill_key, state, created_at, completed_at, result_status, executor_type, executor_id')
      .order('created_at', { ascending: false })
      .limit(15);

    return (data as TimelineExecution[]) || [];
  } catch (err) {
    console.error('[Dashboard] Failed to fetch timeline executions:', err);
    return [];
  }
}

/**
 * 診断ログをDB直読で取得（service_role でRLSバイパス）
 */
async function fetchDiagnosisLogsFromDB(): Promise<FetchResult> {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('system_self_diagnosis_logs')
      .select(
        'id, created_at, trigger_type, system_version, issues_total, issues_auto_fixed, issues_pending_approval'
      )
      .order('created_at', { ascending: false })
      .range(0, 49);

    if (error) {
      console.error('[Dashboard] DB query failed:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true, logs: (data as DiagnosisLog[]) || [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Dashboard] Failed to connect to DB:', message);
    return { success: false, error: message };
  }
}

function calculateHealthMetrics(logs: DiagnosisLog[]) {
  if (logs.length === 0) {
    return null;
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - SEVEN_DAYS_MS);

  // 最終チェック日時
  const latestCheckAt = logs[0].created_at;

  // 未承認件数（全ログの合計）
  const pendingApprovalCount = logs.reduce(
    (sum, log) => sum + log.issues_pending_approval,
    0
  );

  // 直近7日の自動修正数
  const autoFixedLast7Days = logs
    .filter((log) => new Date(log.created_at) >= sevenDaysAgo)
    .reduce((sum, log) => sum + log.issues_auto_fixed, 0);

  // 総チェック数
  const totalChecks = logs.length;

  return {
    latestCheckAt,
    pendingApprovalCount,
    autoFixedLast7Days,
    totalChecks,
  };
}

function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function DashboardPage() {
  // 認証チェック
  const user = await getAuthenticatedUser();

  if (!user) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">認証が必要です</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            ダッシュボードにアクセスするにはログインが必要です。
          </p>
          <a
            href="/login"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            ログインページへ
          </a>
        </div>
      </div>
    );
  }

  // スキル統計（internalを除外した公開スキル数）
  const allSkills = registry.list();
  const publicSkillCount = allSkills.filter((s) => s.category !== 'internal').length;
  const totalSkillCount = allSkills.length;

  // 並列でDBデータ取得
  const [
    result,
    executionMetrics,
    budgetMetrics,
    recentExecutions,
    pendingApprovals,
    agentStatuses,
    skillStats,
    timelineExecutions,
  ] = await Promise.all([
    fetchDiagnosisLogsFromDB(),
    fetchExecutionMetrics(),
    fetchBudgetMetrics(),
    fetchRecentExecutions(),
    fetchPendingApprovals(),
    fetchAgentStatuses(),
    fetchSkillStats(),
    fetchTimelineExecutions(),
  ]);

  const fetchFailed = !result.success;
  const logs = result.success ? result.logs : [];
  const healthMetrics = calculateHealthMetrics(logs);

  return (
    <div className="min-h-screen p-8">
      <header className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">ダッシュボード</h1>
          <p className="text-gray-600 dark:text-gray-400">
            AI Company OS 管理画面
          </p>
        </div>
        <div className="text-right text-sm flex items-center gap-4">
          <div>
            <p className="font-medium">{user.display_name || user.email}</p>
            <p className="text-gray-500 dark:text-gray-400 capitalize">{user.role}</p>
          </div>
          <a
            href="/api/auth/logout"
            className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition"
          >
            ログアウト
          </a>
        </div>
      </header>

      {/* AI Health Section */}
      <section className="mb-8 p-6 border border-gray-300 dark:border-gray-600 rounded-lg">
        <h2 className="text-lg font-bold mb-4">AI Company OS Health</h2>

        {fetchFailed ? (
          <p className="text-red-500">診断ログの取得に失敗しました</p>
        ) : !healthMetrics ? (
          <p className="text-gray-500">データなし</p>
        ) : (
          <>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              最終チェック: {formatDateTime(healthMetrics.latestCheckAt)}
            </p>

            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 border border-gray-200 dark:border-gray-700 rounded text-center">
                <p className="text-3xl font-bold">{healthMetrics.pendingApprovalCount}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">未承認</p>
              </div>

              <div className="p-4 border border-gray-200 dark:border-gray-700 rounded text-center">
                <p className="text-3xl font-bold">{healthMetrics.autoFixedLast7Days}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">自動修正（7日）</p>
              </div>

              <div className="p-4 border border-gray-200 dark:border-gray-700 rounded text-center">
                <p className="text-3xl font-bold">{healthMetrics.totalChecks}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">総チェック数</p>
              </div>
            </div>
          </>
        )}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="p-6 bg-white dark:bg-slate-800 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
            実行中
          </h3>
          <p className="text-3xl font-bold">{executionMetrics.runningCount}</p>
        </div>

        <div className="p-6 bg-white dark:bg-slate-800 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
            承認待ち
          </h3>
          <p className="text-3xl font-bold">{executionMetrics.pendingApprovalCount}</p>
        </div>

        <div className="p-6 bg-white dark:bg-slate-800 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
            今月の予算
          </h3>
          <p className="text-3xl font-bold">${budgetMetrics.usedAmount.toFixed(2)}</p>
          <p className="text-sm text-gray-500">/ ${budgetMetrics.limitAmount.toFixed(2)}</p>
        </div>

        <div className="p-6 bg-white dark:bg-slate-800 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
            登録スキル
          </h3>
          <p className="text-3xl font-bold">{publicSkillCount}</p>
          <p className="text-sm text-gray-500">/ {totalSkillCount} 総数</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="p-6 bg-white dark:bg-slate-800 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">最近の実行</h2>
          {recentExecutions.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">
              実行履歴がありません
            </p>
          ) : (
            <ul className="space-y-2">
              {recentExecutions.map((exec) => (
                <li
                  key={exec.id}
                  className="flex items-center justify-between p-2 border border-gray-200 dark:border-gray-700 rounded"
                >
                  <div>
                    <span className="font-medium">{exec.skill_key}</span>
                    <span className="ml-2 text-xs text-gray-500">
                      {formatDateTime(exec.created_at)}
                    </span>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      exec.state === 'COMPLETED'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : exec.state === 'FAILED'
                          ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                          : exec.state === 'RUNNING'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                    }`}
                  >
                    {exec.state}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="p-6 bg-white dark:bg-slate-800 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">承認キュー</h2>
          {pendingApprovals.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">
              承認待ちの実行はありません
            </p>
          ) : (
            <ul className="space-y-2">
              {pendingApprovals.map((approval) => (
                <li
                  key={approval.id}
                  className="flex items-center justify-between p-2 border border-yellow-200 dark:border-yellow-700 rounded bg-yellow-50 dark:bg-yellow-900/20"
                >
                  <div>
                    <span className="font-medium">{approval.skill_key}</span>
                    <span className="ml-2 text-xs text-gray-500">
                      {formatDateTime(approval.created_at)}
                    </span>
                  </div>
                  <span className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                    {approval.executor_type}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Agent Status Section */}
      <section className="mt-8">
        <AgentStatusCard agents={agentStatuses} />
      </section>

      {/* Execution Timeline and Skill Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <ExecutionTimeline executions={timelineExecutions} maxItems={10} />
        <SkillStatsCard skills={skillStats} maxItems={10} />
      </div>
    </div>
  );
}
