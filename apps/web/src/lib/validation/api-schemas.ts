import { z } from 'zod';
import { NextResponse } from 'next/server';

/**
 * ページネーションパラメータのスキーマ
 */
export const PaginationSchema = z.object({
  limit: z
    .string()
    .optional()
    .default('10')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(100)),
  offset: z
    .string()
    .optional()
    .default('0')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(0)),
});

/**
 * 診断ログトリガータイプ
 */
export const TRIGGER_TYPES = ['cron', 'ci', 'manual'] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

/**
 * 診断ログ一覧取得パラメータ
 */
export const DiagnosisLogsQuerySchema = PaginationSchema.extend({
  trigger_type: z.enum(TRIGGER_TYPES).optional(),
});

/**
 * 診断ログ詳細取得リクエスト
 */
export const DiagnosisLogDetailSchema = z.object({
  id: z.string().uuid(),
});

/**
 * URLSearchParams から Record を抽出
 */
export function searchParamsToRecord(params: URLSearchParams): Record<string, string> {
  const record: Record<string, string> = {};
  params.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

/**
 * 標準エラーコード
 */
export const ErrorCode = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * APIエラーレスポンス型
 */
export interface ApiError {
  error: {
    code: ErrorCode | string;
    message: string;
    detail?: string;
  };
}

/**
 * エラーレスポンス生成ヘルパー
 */
export function errorResponse(
  code: ErrorCode | string,
  message: string,
  status: number,
  detail?: string
): NextResponse<ApiError> {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(detail && { detail }),
      },
    },
    { status }
  );
}

/**
 * よく使うエラーレスポンス
 */
export const ApiErrors = {
  unauthorized: () =>
    errorResponse(ErrorCode.UNAUTHORIZED, 'Authentication required', 401),
  forbidden: (message = 'Insufficient permissions') =>
    errorResponse(ErrorCode.FORBIDDEN, message, 403),
  notFound: (resource = 'Resource') =>
    errorResponse(ErrorCode.NOT_FOUND, `${resource} not found`, 404),
  validationError: (detail: string) =>
    errorResponse(ErrorCode.VALIDATION_ERROR, 'Invalid request', 400, detail),
  internalError: () =>
    errorResponse(ErrorCode.INTERNAL_ERROR, 'Internal server error', 500),
};
