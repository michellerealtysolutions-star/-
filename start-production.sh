#!/usr/bin/env bash
# 生产启动：先构建前端，再由后端托管 dist 静态文件。
set -e
cd "$(dirname "$0")"

cd frontend
npm run build

cd ../backend
npm start
