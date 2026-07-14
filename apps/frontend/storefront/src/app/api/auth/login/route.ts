import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const targetUrl = `${env.GATEWAY_INTERNAL_URL}/crm/auth/login`;

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

    // crm's login response is `{ accessToken }` only (no profile) — fetch
    // the real profile with the freshly-issued token so the client gets a
    // CustomerProfileDto to seed the session store with, not an empty object.
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

    // Map the backend refresh cookie to sf_refresh
    // Backend cookie name: ecomiq_customer_rt (from .env CRM_REFRESH_TOKEN_COOKIE_NAME)
    for (const cookieStr of setCookieHeaders) {
      if (cookieStr.startsWith('ecomiq_customer_rt=')) {
        // Simple extraction - in production you'd use a real cookie parser, but for now we extract the value
        const match = cookieStr.match(/ecomiq_customer_rt=([^;]+)/);
        if (match) {
          nextResponse.cookies.set('sf_refresh', match[1], {
            httpOnly: true,
            secure: env.SESSION_COOKIE_SECURE,
            sameSite: 'lax',
            path: '/api/auth',
            maxAge: 30 * 24 * 60 * 60, // 30 days
          });
        }
      }
    }

    return nextResponse;
  } catch (err) {
    console.error('Login error', err);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
