/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Do not fail production builds on lint errors during the hackathon demo.
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
