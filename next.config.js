/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXTAUTH_URL:
      process.env.NEXTAUTH_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"),
  },
  experimental: {
    serverActions: { bodySizeLimit: "50mb" }, // audio chunk uploads
  },
};

module.exports = nextConfig;
