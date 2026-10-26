/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // TypeScript 7 is checked by the standalone CLI before every build.
  typescript: { ignoreBuildErrors: true },
}

module.exports = nextConfig
