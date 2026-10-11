import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 允许同一局域网内其他设备访问开发服务器（避免跨来源被拦）
  allowedDevOrigins: ['192.168.31.198', '192.168.31.*'],
  experimental: {
    proxyClientMaxBodySize: '500mb',
  },
};

export default nextConfig;
