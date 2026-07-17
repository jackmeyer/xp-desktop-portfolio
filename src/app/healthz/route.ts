import { db } from '../../lib/db';

export function GET() {
  db.prepare('SELECT 1').get();
  // a health probe must never be served from the edge cache
  return new Response('ok', { headers: { 'Cache-Control': 'no-store' } });
}
