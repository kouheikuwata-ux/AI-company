import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest/client';
import { initializeRegistry } from '@ai-company-os/skills';

// Build-time Registry（シングルトン）
const registry = initializeRegistry();

/**
 * リクエストスキーマ
 */
const ExecuteRequestSchema = z.object({
  input: z.record(z.unknown()),
  idempotency_key: z.string().uuid(),
});

/**
 * API Layerの責務：
 * 1. 認証
 * 2. 認可
 * 3. スキル解決・カテゴリ検証
 * 4. 入力検証
 * 5. Command発行
 *
 * - Runner起動しない
 * - DB直接操作しない
 * - ビジネスロジック持たない
 * - internalカテゴリのスキルは直接実行禁止
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { key: string } }
) {
  const skillKey = params.key;

  try {
    // 0. スキル解決（Build-time Registry）
    const skill = registry.get(skillKey);

    if (!skill) {
      return NextResponse.json(
        {
          error: {
            code: 'SKILL_NOT_FOUND',
            message: 'Skill not found',
            key: skillKey,
          },
        },
        { status: 404 }
      );
    }

    // 0.1 internalカテゴリのスキルは外部APIから直接実行禁止
    if (skill.spec.category === 'internal') {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'Internal skills cannot be executed directly via API',
            key: skillKey,
          },
        },
        { status: 403 }
      );
    }

    // 1. 認証
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

    // ユーザー情報取得（tenant_id含む）
    const { data: userData } = await supabase
      .from('users')
      .select('id, tenant_id')
      .eq('id', session.user.id)
      .single();

    // Supabaseの型推論制限のため、型アサーションを使用
    const user = userData as { id: string; tenant_id: string } | null;

    if (!user) {
      return NextResponse.json(
        { error: { code: 'USER_NOT_FOUND', message: 'User not found' } },
        { status: 404 }
      );
    }

    // 2. 入力検証
    const body = await request.json();
    const parseResult = ExecuteRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: parseResult.error.errors,
          },
        },
        { status: 400 }
      );
    }

    // 3. Command発行（Inngest経由）
    const traceId = crypto.randomUUID();

    const { ids } = await inngest.send({
      name: 'skill/execute.requested',
      data: {
        skill_key: skillKey,
        input: parseResult.data.input,
        idempotency_key: parseResult.data.idempotency_key,

        // 責任モデル
        executor_type: 'user',
        executor_id: session.user.id,
        legal_responsible_user_id: session.user.id,
        responsibility_level: 1, // HUMAN_APPROVED

        // コンテキスト
        tenant_id: user.tenant_id,
        trace_id: traceId,
        request_origin: 'api',
      },
    });

    // 4. 即時レスポンス（非同期実行）
    return NextResponse.json(
      {
        execution_id: ids[0],
        idempotency_key: parseResult.data.idempotency_key,
        status: 'ACCEPTED',
        poll_url: `/api/executions/${ids[0]}`,
      },
      { status: 202 }
    );
  } catch (error) {
    console.error('Skill execute error:', error);

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
