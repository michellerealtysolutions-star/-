#!/usr/bin/env bash
# 生产启动：安装依赖（首次运行）→ 构建前端 → 由后端托管 API 和 dist 静态文件。
set -e
cd "$(dirname "$0")"

if [ ! -d "frontend/node_modules" ]; then
  echo "[start-production] 安装前端依赖..."
  (cd frontend && npm ci)
fi

if [ ! -d "backend/node_modules" ]; then
  echo "[start-production] 安装后端依赖..."
  (cd backend && npm ci)
fi

cd frontend
npm run build

cd ../backend
npm start
