import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sfAccess = cookieStore.get('sf_access');

    if (sfAccess) {
      const targetUrl = `${env.GATEWAY_INTERNAL_URL}/crm/auth/logout`;
      
      // Fire and forget logout to CRM (or await it, but we clear cookies either way)
      await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sfAccess.value}`,
        },
      }).catch(console.error);
    }

    const nextResponse = NextResponse.json({ success: true }, { status: 200 });
    
    // Clear cookies unconditionally
    nextResponse.cookies.delete('sf_access');
    nextResponse.cookies.delete('sf_refresh');

    return nextResponse;
  } catch (err) {
    console.error('Logout error', err);
    // Still clear cookies on error
    const nextResponse = NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
    nextResponse.cookies.delete('sf_access');
    nextResponse.cookies.delete('sf_refresh');
    return nextResponse;
  }
}
