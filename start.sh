#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "==> 检查 Node.js 环境..."
if ! command -v node &>/dev/null; then
  echo "❌ 未找到 Node.js，请先安装 Node.js"
  exit 1
fi
echo "✅ Node.js $(node -v)"

echo "==> 检查依赖..."
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.package-lock.json" ]; then
  echo "⏳ 正在安装依赖..."
  npm install
fi
echo "✅ 依赖已就绪"

echo "==> 启动开发服务器..."
echo "✅ 访问地址: http://localhost:3000"
npm run dev
