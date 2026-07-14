import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import type { NewsletterSubscribeRequestDto } from '@temp-nx/api-types/marketing';

// Proxies to marketing-service's `POST /marketing/forms/:id/submissions` —
// a client component can't call `gatewayFetch` (server-only) or reach
// GATEWAY_INTERNAL_URL directly, so this route exists purely to bridge that,
// same pattern as the /api/auth/* routes.
export async function POST(req: NextRequest) {
  if (!env.NEWSLETTER_FORM_ID) {
    console.error('NEWSLETTER_FORM_ID is not configured — create the form in the admin marketing UI first');
    return NextResponse.json({ message: 'Newsletter signup is not configured' }, { status: 503 });
  }

  try {
    const body: NewsletterSubscribeRequestDto = await req.json();
    const targetUrl = `${env.GATEWAY_INTERNAL_URL}/marketing/forms/${env.NEWSLETTER_FORM_ID}/submissions`;

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(errorData, { status: response.status });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('Newsletter subscribe error', err);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
