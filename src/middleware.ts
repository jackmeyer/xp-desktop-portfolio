import { defineMiddleware } from 'astro:middleware';
import { getSessionUser, sessionCookieOptions } from './lib/auth';

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  if (pathname.startsWith('/admin')) {
    // CSRF: SameSite=Strict cookie + Astro's built-in origin check on mutating requests
    const token = context.cookies.get('session')?.value;
    const user = getSessionUser(token);
    if (user) {
      context.locals.user = user;
      // getSessionUser just slid the db expiry; slide the cookie to match
      context.cookies.set('session', token!, sessionCookieOptions);
    } else if (pathname !== '/admin/login') {
      return context.redirect('/admin/login');
    }
  }

  const response = await next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // uploads must be frameable by our own desktop (the in-desktop PDF viewer)
  response.headers.set(
    'Content-Security-Policy',
    pathname.startsWith('/uploads') ? "frame-ancestors 'self'" : "frame-ancestors 'none'"
  );
  if (pathname.startsWith('/admin')) {
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Robots-Tag', 'noindex');
  } else if (['GET', 'HEAD'].includes(context.request.method) && !response.headers.has('Cache-Control')) {
    // edge caching: content edits appear within a minute (design doc §7)
    response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=86400');
  }
  return response;
});
