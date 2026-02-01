/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@ai-company-os/database',
    '@ai-company-os/runner',
    '@ai-company-os/skill-spec',
    '@ai-company-os/skills',
  ],
  experimental: {
    serverComponentsExternalPackages: ['@anthropic-ai/sdk'],
  },
};

module.exports = nextConfig;
