import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const types: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
};

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  // uploads are UUIDs or sanitized PDF names: [\w.-] only, no leading dot,
  // no path separators — traversal is unrepresentable
  if (!/^[\w-][\w.-]*\.\w+$/.test(file)) return new Response('Not found', { status: 404 });
  const path = join(process.env.DATA_DIR || 'data', 'uploads', file);
  if (!existsSync(path)) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(readFileSync(path)), {
    headers: {
      'Content-Type': types[extname(file).toLowerCase()] ?? 'application/octet-stream',
      // filenames are UUIDs, so content never changes under a name
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
