#!/bin/bash
cd "$(dirname "$0")"

echo "
╔══════════════════════════════════════╗
║        IP Manager 一键启动           ║
╚══════════════════════════════════════╝
"

echo "==> 检查 Node.js..."
if ! command -v node &>/dev/null; then
  echo "❌ 未找到 Node.js，请先安装 Node.js"
  read -p "按回车键退出..."
  exit 1
fi
echo "✅ Node.js $(node -v)"

echo "==> 检查依赖..."
if [ ! -d "node_modules" ]; then
  echo "⏳ 正在安装依赖，请稍候..."
  npm install
fi
echo "✅ 依赖已就绪"

echo "==> 启动服务器..."
echo "✅ 浏览器打开 http://localhost:3000"
echo "📌 按 Ctrl+C 停止服务器"
echo ""

sleep 1
open http://localhost:3000
npm run dev
