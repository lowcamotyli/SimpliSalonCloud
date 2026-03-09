const { withSentryConfig } = require('@sentry/nextjs')

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
}

const withSentry = process.env.VERCEL_ENV === 'production' && process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    silent: true,
  }, {
    widenClientFileUpload: true,
    tunnelRoute: '/monitoring',
    automaticVercelMonitors: false,
  })
  : nextConfig;

module.exports = withSentry;
