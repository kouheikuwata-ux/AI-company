import { NextResponse } from 'next/server';
import packageJson from '../../../../package.json';

/**
 * ヘルスチェックAPI
 *
 * GET /api/health
 *
 * 認証: 不要（公開エンドポイント）
 *
 * レスポンス:
 *   - status: 'ok' | 'degraded' | 'error'
 *   - version: アプリケーションバージョン
 *   - timestamp: 現在時刻
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    version: packageJson.version,
    name: packageJson.name,
    timestamp: new Date().toISOString(),
  });
}
