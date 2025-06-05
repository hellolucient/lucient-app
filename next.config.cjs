/** @type {import('next').NextConfig} */
const nextConfig = {
  // experimental: {
  //   serverComponentsExternalPackages: ['pdf-parse'], // Old key
  // },
  serverExternalPackages: ['pdf-parse'], // Updated key
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'oaidalleapiprodscus.blob.core.windows.net',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // If you have other configurations, they would go here
  // For example:
  // reactStrictMode: true,
  // images: { domains: ['example.com'] },
};

module.exports = nextConfig; 