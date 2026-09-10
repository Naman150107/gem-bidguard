/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Do not fail production builds on lint errors during the hackathon demo.
    ignoreDuringBuilds: false,
  },
  experimental: {
    // pdf-parse ships a dynamic require over its bundled pdf.js versions that
    // webpack cannot statically resolve; it is server-only (upload route), so
    // load it from node_modules at runtime instead of bundling it.
    serverComponentsExternalPackages: ["pdf-parse"],
  },
};

export default nextConfig;
