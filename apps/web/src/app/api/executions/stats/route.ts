import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/auth/helpers';

interface SkillStats {
  skill_key: string;
  total: number;
  completed: number;
  failed: number;
  success_rate: number;
}

/**
 * 実行統計API
 *
 * GET /api/executions/stats
 *
 * Response:
 * - total_executions: 総実行数
 * - by_state: 状態別実行数
 * - by_skill: スキル別統計
 * - success_rate: 全体成功率
 * - total_cost: 総コスト
 */
export async function GET() {
  try {
    // 認証チェック
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const supabase = createAdminClient();

    // 総実行数を取得
    const { count: totalExecutions } = await supabase
      .from('skill_executions')
      .select('*', { count: 'exact', head: true });

    // 状態別実行数を取得
    const { data: stateData } = await supabase
      .from('skill_executions')
      .select('state');

    const byState: Record<string, number> = {};
    if (stateData) {
      for (const row of stateData) {
        const rowData = row as { state: string };
        byState[rowData.state] = (byState[rowData.state] || 0) + 1;
      }
    }

    // スキル別統計を取得
    const { data: skillData } = await supabase
      .from('skill_executions')
      .select('skill_key, state');

    const skillMap = new Map<string, { total: number; completed: number; failed: number }>();

    if (skillData) {
      for (const row of skillData) {
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
    }

    const bySkill: SkillStats[] = Array.from(skillMap.entries())
      .map(([skill_key, stats]) => ({
        skill_key,
        total: stats.total,
        completed: stats.completed,
        failed: stats.failed,
        success_rate: stats.total > 0
          ? Math.round((stats.completed / stats.total) * 100)
          : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20); // 上位20スキル

    // 成功率を計算
    const completedCount = byState['COMPLETED'] || 0;
    const failedCount = byState['FAILED'] || 0;
    const finishedCount = completedCount + failedCount;
    const successRate = finishedCount > 0
      ? Math.round((completedCount / finishedCount) * 100)
      : 0;

    // 総コストを取得
    const { data: costData } = await supabase
      .from('skill_executions')
      .select('budget_consumed_amount')
      .not('budget_consumed_amount', 'is', null);

    const totalCost = costData
      ? costData.reduce((sum, row) => {
          const rowData = row as { budget_consumed_amount: number | null };
          return sum + (rowData.budget_consumed_amount || 0);
        }, 0)
      : 0;

    // 今日の実行数
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count: todayExecutions } = await supabase
      .from('skill_executions')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', today.toISOString());

    // 過去7日の日別実行数
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const { data: dailyData } = await supabase
      .from('skill_executions')
      .select('created_at')
      .gte('created_at', sevenDaysAgo.toISOString());

    const dailyCounts: Record<string, number> = {};
    if (dailyData) {
      for (const row of dailyData) {
        const rowData = row as { created_at: string };
        const date = new Date(rowData.created_at).toISOString().split('T')[0];
        dailyCounts[date] = (dailyCounts[date] || 0) + 1;
      }
    }

    return NextResponse.json({
      total_executions: totalExecutions || 0,
      today_executions: todayExecutions || 0,
      by_state: byState,
      by_skill: bySkill,
      success_rate: successRate,
      total_cost: Math.round(totalCost * 100) / 100, // 小数点2桁に丸める
      daily_counts: dailyCounts,
    });
  } catch (error) {
    console.error('[API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
