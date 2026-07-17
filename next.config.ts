import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // native modules must stay external to the server bundle
  serverExternalPackages: ['better-sqlite3', 'argon2'],
  experimental: {
    serverActions: {
      // uploads go through server actions; PDFs are allowed up to 10 MB
      bodySizeLimit: '12mb',
    },
  },
};

export default nextConfig;
