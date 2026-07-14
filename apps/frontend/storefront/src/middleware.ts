import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const sfAccess = request.cookies.get('sf_access');
  
  if (!sfAccess) {
    const nextUrl = new URL('/login', request.url);
    nextUrl.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(nextUrl);
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/account/:path*', '/checkout/:path*'],
};
