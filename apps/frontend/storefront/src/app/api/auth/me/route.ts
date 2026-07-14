import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sfAccess = cookieStore.get('sf_access');

    if (!sfAccess) {
      return NextResponse.json(null, { status: 200 });
    }

    const targetUrl = `${env.GATEWAY_INTERNAL_URL}/crm/storefront/me`;

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${sfAccess.value}`,
      },
      cache: 'no-store', // ensures we always check the backend
    });

    if (response.status === 401) {
      return NextResponse.json(null, { status: 200 });
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(errorData, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error('Me error', err);
    return NextResponse.json(null, { status: 200 });
  }
}
