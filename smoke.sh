#!/usr/bin/env bash
# 一键工程冒烟测试：依次运行前端/后端测试，并检查真实接口与媒体链路。
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
API_URL="${API_URL:-http://127.0.0.1:3001}"
WEB_URL="${WEB_URL:-https://localhost:5173}"

echo "[1/7] 前端测试与构建"
cd "$ROOT_DIR/frontend"
npm test
npm run build

echo "[2/7] 后端测试"
cd "$ROOT_DIR/backend"
npm test

echo "[3/7] 服务健康检查"
curl -fsS "$API_URL/health" | grep -q '"status":"ok"'
curl -fsS "${ASR_URL:-http://127.0.0.1:10095}/health" | grep -q '"status":"ok"'

echo "[4/7] 翻译与梗分类接口"
curl -fsS -H 'Content-Type: application/json' \
  -d '{"text":"yyds","direction":"auto","tone":"gentle"}' \
  "$API_URL/api/translate" | grep -q '"category":"缩写梗"'

echo "[5/7] 安全拦截"
! curl -fsS -H 'Content-Type: application/json' \
  -d '{"text":"傻。逼","direction":"auto","tone":"gentle"}' \
  "$API_URL/api/translate" >/dev/null

echo "[6/7] 音频与视频识别"
curl -fsS -H 'Content-Type: application/json' \
  -d "$(printf '{"audio_base64":"%s","mime":"audio/wav","lang":"auto"}' "$(base64 < "$ROOT_DIR/frontend/public/demo/yue-00020.wav" | tr -d '\n')")" \
  "$API_URL/api/transcribe" | grep -q '你好似瘦咗'

curl -fsS -H 'Content-Type: application/json' \
  -d "$(printf '{"audio_base64":"%s","mime":"audio/wav","lang":"auto"}' "$(base64 < "$ROOT_DIR/frontend/public/demo/yue-elder.wav" | tr -d '\n')")" \
  "$API_URL/api/transcribe" | grep -q '后生仔'

curl -fsS -F "file=@$ROOT_DIR/frontend/public/demo/yue-00020.mp4;type=video/mp4" \
  "$API_URL/api/transcribe/video" | grep -q '你好似瘦咗'

echo "[7/7] 前端与后端静态资源"
curl -kfsS "$WEB_URL/" >/dev/null
curl -fsS "$API_URL/" >/dev/null
curl -kfsS "$WEB_URL/demo/meme-yyds.png" >/dev/null
curl -fsS "$API_URL/demo/meme-yyds.png" >/dev/null

echo ""
echo "✅ 全部冒烟测试通过"
