import { NextResponse, type NextRequest } from 'next/server';

// The admin has no routes (it's a window on the desktop, driven by server
// actions), so there's nothing to gate here — auth lives inside the actions,
// and the session cookie slides in getAdminData(). This proxy only sets
// response headers.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // uploads must be frameable by our own desktop (the in-desktop PDF viewer)
  response.headers.set(
    'Content-Security-Policy',
    pathname.startsWith('/uploads') ? "frame-ancestors 'self'" : "frame-ancestors 'none'"
  );
  if (
    ['GET', 'HEAD'].includes(request.method) &&
    !pathname.startsWith('/uploads') && // sets its own immutable caching
    pathname !== '/healthz' && // must never be cached
    // RSC payload fetches (client nav, router.refresh after admin edits) must
    // stay fresh — browsers honor stale-while-revalidate and would otherwise
    // serve refreshed data from cache
    !request.headers.get('rsc')
  ) {
    // edge caching: content edits appear within a minute (design doc §7).
    // Server-action POSTs are never cached, so admin data stays private.
    response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=86400');
  }
  return response;
}

export const config = {
  // skip Next's static assets; they ship their own immutable cache headers
  matcher: '/((?!_next/).*)',
};
