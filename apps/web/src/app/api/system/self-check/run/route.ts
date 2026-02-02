/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runSelfCheck } from '@/lib/diagnosis/runSelfCheck';

/**
 * Cron 用 Self-Check 実行 API
 *
 * GET /api/system/self-check/run
 *
 * 認証:
 *   - x-cron-secret ヘッダーが CRON_SECRET と一致する必要がある
 *   - Vercel Cron は自動的にこのヘッダーを付与
 *
 * 動作:
 *   1. Self-Check を実行
 *   2. 結果を system_self_diagnosis_logs に保存（trigger_type='cron'）
 *   3. 成功/失敗をレスポンスで返す
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // 認証チェック
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = request.headers.get('x-cron-secret');

  if (!cronSecret) {
    console.error('[Cron Self-Check] CRON_SECRET is not configured');
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured' },
      { status: 500 }
    );
  }

  if (providedSecret !== cronSecret) {
    console.error('[Cron Self-Check] Invalid cron secret');
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    // Self-Check 実行
    console.log('[Cron Self-Check] Starting diagnosis...');
    const result = runSelfCheck({ full: false });
    console.log(`[Cron Self-Check] Diagnosis completed: ${result.full_report.totals.passed} passed, ${result.full_report.totals.failed} failed, ${result.full_report.totals.warnings} warnings`);

    // DB保存（service_role でRLSバイパス）
    const supabase = createAdminClient();

    // Supabase JS v2 の型推論制限により、from() が never を返す問題がある
    // Database 型は正しく定義されているが、TypeScript のビルド時推論が複雑すぎる
    // 将来の Supabase JS アップデートで解決される予定
    const { error: insertError } = await (
      supabase.from('system_self_diagnosis_logs') as ReturnType<typeof supabase.from>
    ).insert({
      trigger_type: 'cron',
      system_version: result.system_version,
      issues_total: result.issues_total,
      issues_auto_fixed: result.issues_auto_fixed,
      issues_pending_approval: result.issues_pending_approval,
      summary: result.summary,
      full_report: result.full_report,
    });

    if (insertError) {
      console.error('[Cron Self-Check] Failed to save to DB:', insertError.message);
      return NextResponse.json(
        {
          error: 'Failed to save diagnosis result',
          detail: insertError.message,
          diagnosis: {
            passed: result.full_report.totals.passed,
            failed: result.full_report.totals.failed,
            warnings: result.full_report.totals.warnings,
          },
        },
        { status: 500 }
      );
    }

    const totalTime = Date.now() - startTime;
    console.log(`[Cron Self-Check] Saved to DB. Total time: ${totalTime}ms`);

    return NextResponse.json({
      success: true,
      trigger_type: 'cron',
      system_version: result.system_version,
      diagnosis: {
        passed: result.full_report.totals.passed,
        failed: result.full_report.totals.failed,
        warnings: result.full_report.totals.warnings,
        issues_total: result.issues_total,
      },
      duration_ms: totalTime,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Cron Self-Check] Unexpected error:', message);
    return NextResponse.json(
      { error: 'Self-check execution failed', detail: message },
      { status: 500 }
    );
  }
}
