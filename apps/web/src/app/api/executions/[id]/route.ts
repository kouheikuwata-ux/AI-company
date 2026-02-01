import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * 実行状態取得API
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 認証
    const supabase = createServerSupabaseClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    // 実行情報取得
    const { data: execution, error } = await supabase
      .from('skill_executions')
      .select(
        `
        id,
        idempotency_key,
        skill_key,
        skill_version,
        state,
        created_at,
        started_at,
        completed_at,
        result_status,
        result_summary,
        error_code,
        error_message
      `
      )
      .eq('id', params.id)
      .single();

    if (error || !execution) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Execution not found' } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      execution,
    });
  } catch (error) {
    console.error('Get execution error:', error);

    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      },
      { status: 500 }
    );
  }
}
