// @ts-check
import { defineConfig } from 'astro/config';

import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone'
  }),

  // xp.css 0.2.6 has a selector lightningcss rejects; esbuild tolerates it
  vite: { build: { cssMinify: 'esbuild' } }
});