/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow inspect-canvas to proxy this app
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "ALLOWALL" },
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
    ];
  },
};

export default nextConfig;
