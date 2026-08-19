#!/usr/bin/env bash
# 生产启动：安装依赖（首次运行）→ 启动 FunASR → 构建前端 → 由后端托管 API 和 dist 静态文件。
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

ASR_URL="${ASR_URL:-http://127.0.0.1:10095}"
ASR_LOG="/tmp/yuyi-funasr.log"
ASR_PID=""

cleanup() {
  if [ -n "$ASR_PID" ] && kill -0 "$ASR_PID" 2>/dev/null; then
    echo "[start-production] 正在停止 FunASR..."
    kill "$ASR_PID" 2>/dev/null || true
    wait "$ASR_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if [ ! -d "frontend/node_modules" ]; then
  echo "[start-production] 安装前端依赖..."
  (cd frontend && npm ci)
fi

if [ ! -d "backend/node_modules" ]; then
  echo "[start-production] 安装后端依赖..."
  (cd backend && npm ci)
fi

if curl -fsS "$ASR_URL/health" >/dev/null 2>&1; then
  echo "[start-production] FunASR 已在运行：$ASR_URL"
else
  echo "[start-production] 启动 FunASR 方言识别服务..."
  bash deploy/funasr/run.sh >"$ASR_LOG" 2>&1 &
  ASR_PID=$!

  for _ in $(seq 1 180); do
    if curl -fsS "$ASR_URL/health" >/dev/null 2>&1; then
      break
    fi
    if ! kill -0 "$ASR_PID" 2>/dev/null; then
      echo "[start-production] FunASR 启动失败，日志如下："
      tail -50 "$ASR_LOG" || true
      exit 1
    fi
    sleep 1
  done

  if ! curl -fsS "$ASR_URL/health" >/dev/null 2>&1; then
    echo "[start-production] 等待 FunASR 就绪超时，日志如下："
    tail -50 "$ASR_LOG" || true
    exit 1
  fi
  echo "[start-production] FunASR 已就绪：$ASR_URL"
fi

cd frontend
npm run build

cd ../backend
npm start
