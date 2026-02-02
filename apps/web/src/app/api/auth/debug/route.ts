import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { Database } from '@ai-company-os/database';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const cookieStore = cookies();
    const allCookies = cookieStore.getAll();

    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Server Component では set できない場合がある
            }
          },
        },
      }
    );

    // getUser で認証状態を確認
    const { data: userData, error: userError } = await supabase.auth.getUser();

    // getSession も確認
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    return NextResponse.json({
      cookies: allCookies.map((c) => ({ name: c.name, valueLength: c.value.length })),
      cookieCount: allCookies.length,
      user: userData?.user
        ? {
            id: userData.user.id,
            email: userData.user.email,
            role: userData.user.role,
          }
        : null,
      userError: userError?.message || null,
      session: sessionData?.session
        ? {
            userId: sessionData.session.user.id,
            expiresAt: sessionData.session.expires_at,
          }
        : null,
      sessionError: sessionError?.message || null,
      env: {
        hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
