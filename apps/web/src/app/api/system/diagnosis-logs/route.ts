import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/auth/helpers';
import {
  DiagnosisLogsQuerySchema,
  DiagnosisLogDetailSchema,
  searchParamsToRecord,
} from '@/lib/validation/api-schemas';
import { ZodError } from 'zod';

/**
 * Zod エラーをフォーマット
 */
function formatZodError(error: ZodError): string {
  return error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
}

/**
 * システム自己診断ログ取得API
 *
 * GET /api/system/diagnosis-logs
 *
 * 認証: 必須（admin または owner ロールのユーザーのみ）
 *
 * Query Parameters:
 *   - limit: 取得件数（デフォルト: 10, 最大: 100）
 *   - offset: オフセット（デフォルト: 0）
 *   - trigger_type: フィルタ（cron / ci / manual）
 */
export async function GET(request: NextRequest) {
  try {
    // 認証・権限チェック
    const user = await getAdminUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Admin or owner role required' },
        { status: 403 }
      );
    }

    // パラメータバリデーション
    const rawParams = searchParamsToRecord(request.nextUrl.searchParams);
    const parseResult = DiagnosisLogsQuerySchema.safeParse(rawParams);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', detail: formatZodError(parseResult.error) },
        { status: 400 }
      );
    }

    const { limit, offset, trigger_type: triggerType } = parseResult.data;

    // Supabase Admin Client（service_role でRLSバイパス）
    const supabase = createAdminClient();

    // クエリ構築
    let query = supabase
      .from('system_self_diagnosis_logs')
      .select(
        `
        id,
        created_at,
        trigger_type,
        system_version,
        issues_total,
        issues_auto_fixed,
        issues_pending_approval,
        summary
      `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // trigger_type フィルタ
    if (triggerType) {
      query = query.eq('trigger_type', triggerType);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Failed to fetch diagnosis logs:', error);
      return NextResponse.json(
        { error: 'Failed to fetch diagnosis logs', detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      logs: data || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        has_more: (count || 0) > offset + limit,
      },
    });
  } catch (err) {
    console.error('Unexpected error in diagnosis-logs API:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * 特定ログの詳細取得（full_report含む）
 *
 * POST /api/system/diagnosis-logs
 * Body: { id: string (UUID) }
 *
 * 認証: 必須（admin または owner ロールのユーザーのみ）
 */
export async function POST(request: NextRequest) {
  try {
    // 認証・権限チェック
    const user = await getAdminUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Admin or owner role required' },
        { status: 403 }
      );
    }

    // ボディバリデーション
    const body = await request.json();
    const parseResult = DiagnosisLogDetailSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', detail: formatZodError(parseResult.error) },
        { status: 400 }
      );
    }

    const { id } = parseResult.data;

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('system_self_diagnosis_logs')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Diagnosis log not found' },
          { status: 404 }
        );
      }
      console.error('Failed to fetch diagnosis log:', error);
      return NextResponse.json(
        { error: 'Failed to fetch diagnosis log', detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ log: data });
  } catch (err) {
    console.error('Unexpected error in diagnosis-logs API:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
