import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sfRefresh = cookieStore.get('sf_refresh');

    if (!sfRefresh) {
      return NextResponse.json({ message: 'No refresh token' }, { status: 401 });
    }

    const targetUrl = `${env.GATEWAY_INTERNAL_URL}/crm/auth/refresh`;

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward sf_refresh as ecomiq_customer_rt
        'Cookie': `ecomiq_customer_rt=${sfRefresh.value}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const nextResponse = NextResponse.json(errorData, { status: response.status });
      // If refresh fails, clear cookies
      nextResponse.cookies.delete('sf_access');
      nextResponse.cookies.delete('sf_refresh');
      return nextResponse;
    }

    const data = await response.json();
    const setCookieHeaders = response.headers.getSetCookie();

    const nextResponse = NextResponse.json(data, { status: 200 });

    if (data.accessToken) {
      nextResponse.cookies.set('sf_access', data.accessToken, {
        httpOnly: true,
        secure: env.SESSION_COOKIE_SECURE,
        sameSite: 'lax',
        path: '/',
      });
      delete data.accessToken;
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
    console.error('Refresh error', err);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
