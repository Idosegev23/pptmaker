/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable experimental features for server components
  experimental: {
    serverComponentsExternalPackages: ['playwright', 'pdf-lib'],
  },
  
  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },

  // Webpack configuration for Playwright
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push({
        'playwright': 'commonjs playwright',
      })
    }
    return config
  },
}

module.exports = nextConfig
