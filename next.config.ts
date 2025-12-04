import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Explicitly set the workspace root to silence the lockfile warning
  outputFileTracingRoot: path.join(__dirname),
  // Enable experimental features if needed
  experimental: {
    // Add any experimental features here
  },
}

export default nextConfig

