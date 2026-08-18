#!/usr/bin/env bash
# 轻量上传脚本：只同步源码和构建产物，不上传 node_modules、密钥、证书、模型缓存。
set -e

cd "$(dirname "$0")/.."

DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_HOST="${DEPLOY_HOST:?请设置 DEPLOY_HOST，例如 user@1.2.3.4}"
DEPLOY_PATH="${DEPLOY_PATH:?请设置 DEPLOY_PATH，例如 /opt/yuyi}"

rsync -avz \
  --exclude 'backend/node_modules' \
  --exclude 'backend/.env' \
  --exclude 'frontend/node_modules' \
  --exclude 'frontend/certs' \
  --exclude '.git' \
  --exclude 'yuyi-deploy-package.tar.gz' \
  backend frontend deploy demo start-production.sh README.md PROJECT.md \
  "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/"

echo ""
echo "上传完成。请在服务器上执行："
echo "  cd ${DEPLOY_PATH}"
echo "  cd backend && npm install && cd .."
echo "  cd frontend && npm install && npm run build && cd .."
echo "  ./start-production.sh"
