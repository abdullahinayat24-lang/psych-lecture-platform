/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: "50mb" }, // audio chunk uploads
  },
};

module.exports = nextConfig;
