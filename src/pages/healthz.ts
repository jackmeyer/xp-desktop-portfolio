import type { APIRoute } from 'astro';
import { db } from '../lib/db';

export const GET: APIRoute = () => {
  db.prepare('SELECT 1').get();
  // a health probe must never be served from the edge cache
  return new Response('ok', { headers: { 'Cache-Control': 'no-store' } });
};
