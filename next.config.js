/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // TypeScript 7 is checked by the standalone CLI before every build.
  typescript: { ignoreBuildErrors: true },
};

module.exports = nextConfig;
