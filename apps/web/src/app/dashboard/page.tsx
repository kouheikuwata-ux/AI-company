import { initializeRegistry } from '@ai-company-os/skills';
import { createAdminClient } from '@/lib/supabase/admin';

// 動的レンダリング強制（最新ログを必ず反映）
export const dynamic = 'force-dynamic';

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
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

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
  // スキル統計（internalを除外した公開スキル数）
  const allSkills = registry.list();
  const publicSkillCount = allSkills.filter((s) => s.category !== 'internal').length;
  const totalSkillCount = allSkills.length;

  // 診断ログ取得（DB直読）
  const result = await fetchDiagnosisLogsFromDB();
  const fetchFailed = !result.success;
  const logs = result.success ? result.logs : [];
  const healthMetrics = calculateHealthMetrics(logs);

  return (
    <div className="min-h-screen p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">ダッシュボード</h1>
        <p className="text-gray-600 dark:text-gray-400">
          AI Company OS 管理画面
        </p>
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
          <p className="text-3xl font-bold">0</p>
        </div>

        <div className="p-6 bg-white dark:bg-slate-800 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
            承認待ち
          </h3>
          <p className="text-3xl font-bold">0</p>
        </div>

        <div className="p-6 bg-white dark:bg-slate-800 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
            今月の予算
          </h3>
          <p className="text-3xl font-bold">$0.00</p>
          <p className="text-sm text-gray-500">/ $100.00</p>
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
          <p className="text-gray-500 dark:text-gray-400">
            実行履歴がありません
          </p>
        </section>

        <section className="p-6 bg-white dark:bg-slate-800 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">承認キュー</h2>
          <p className="text-gray-500 dark:text-gray-400">
            承認待ちの実行はありません
          </p>
        </section>
      </div>
    </div>
  );
}
