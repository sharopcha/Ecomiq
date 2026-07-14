//@ts-check

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Output standalone for Docker builds
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'api-gateway',
        port: '3000',
        pathname: '/api/media/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3000',
        pathname: '/api/media/**',
      },
    ],
  },
};

export default nextConfig;
