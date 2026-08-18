/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    AEGIS_API_URL: process.env.AEGIS_API_URL ?? 'http://127.0.0.1:3001',
  },
};

export default nextConfig;
