import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const targetUrl = `${env.GATEWAY_INTERNAL_URL}/crm/auth/register`;

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(errorData, { status: response.status });
    }

    // crm's register response is `{ accessToken }` only (no profile) — fetch
    // the real profile with the freshly-issued token, same as /api/auth/login.
    const { accessToken } = (await response.json()) as { accessToken?: string };
    const setCookieHeaders = response.headers.getSetCookie();

    let profile: unknown = null;
    if (accessToken) {
      const meRes = await fetch(`${env.GATEWAY_INTERNAL_URL}/crm/storefront/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      if (meRes.ok) {
        profile = await meRes.json();
      }
    }

    const nextResponse = NextResponse.json(profile, { status: 200 });

    if (accessToken) {
      nextResponse.cookies.set('sf_access', accessToken, {
        httpOnly: true,
        secure: env.SESSION_COOKIE_SECURE,
        sameSite: 'lax',
        path: '/',
      });
    }

    for (const cookieStr of setCookieHeaders) {
      if (cookieStr.startsWith('ecomiq_customer_rt=')) {
        const match = cookieStr.match(/ecomiq_customer_rt=([^;]+)/);
        if (match) {
          nextResponse.cookies.set('sf_refresh', match[1], {
            httpOnly: true,
            secure: env.SESSION_COOKIE_SECURE,
            sameSite: 'lax',
            path: '/api/auth',
            maxAge: 30 * 24 * 60 * 60,
          });
        }
      }
    }

    return nextResponse;
  } catch (err) {
    console.error('Register error', err);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
