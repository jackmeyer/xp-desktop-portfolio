// Shared by the login action and the middleware. Lives apart from auth.ts so
// the middleware (edge bundle) never pulls in better-sqlite3/argon2.
export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 30 * 86400,
} as const;
