/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverComponentsExternalPackages: ["postgres"],
    // The dashboard must always show the latest calls.
    staleTimes: { dynamic: 0 },
  },
};

export default nextConfig;
