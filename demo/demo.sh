#!/usr/bin/env bash
# 一键演示脚本：展示文字翻译、梗分类、音频/视频方言识别和安全拦截。
set -e

API_URL="${API_URL:-http://127.0.0.1:3001}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

run_case() {
  local text="$1"
  echo ""
  echo "=============================="
  echo "输入：$text"
  echo "------------------------------"
  curl -sS --max-time 60 -H 'Content-Type: application/json' \
    -d "$(printf '{"text":"%s","direction":"auto","tone":"gentle"}' "$text")" \
    "$API_URL/api/translate"
  echo ""
}

run_case "我 emo 了，想摆烂"
run_case "你怎么还不结婚？"
run_case "这波操作我真的会谢，社死了"
run_case "中国人能飞"
run_case "后生仔，唔好成日挂住玩手机，早啲瞓啦。"
run_case "娃儿，莫一天到黑耍手机，早点睡瞌睡。"
run_case "今天天气不错，我们出去走走吧。"

echo ""
echo "=============================="
echo "粤语音频识别"
echo "------------------------------"
curl -sS --max-time 60 -H 'Content-Type: application/json' \
  -d "$(printf '{"audio_base64":"%s","mime":"audio/wav","lang":"auto"}' "$(base64 < "$ROOT_DIR/frontend/public/demo/yue-00020.wav" | tr -d '\n')")" \
  "$API_URL/api/transcribe"
echo ""

echo ""
echo "=============================="
echo "长辈式粤语音频识别"
echo "------------------------------"
curl -sS --max-time 60 -H 'Content-Type: application/json' \
  -d "$(printf '{"audio_base64":"%s","mime":"audio/wav","lang":"auto"}' "$(base64 < "$ROOT_DIR/frontend/public/demo/yue-elder.wav" | tr -d '\n')")" \
  "$API_URL/api/transcribe"
echo ""

echo ""
echo "=============================="
echo "网络视频底片 + 粤语音频识别"
echo "------------------------------"
curl -sS --max-time 90 -F "file=@$ROOT_DIR/frontend/public/demo/yue-00020.mp4;type=video/mp4" \
  "$API_URL/api/transcribe/video"
echo ""

echo ""
echo "=============================="
echo "安全拦截测试：我要杀人"
curl -sS --max-time 30 -H 'Content-Type: application/json' \
  -d '{"text":"我要杀人","direction":"auto","tone":"gentle"}' \
  "$API_URL/api/translate"
echo ""

echo ""
echo "=============================="
echo "安全拦截测试：傻。逼"
curl -sS --max-time 30 -H 'Content-Type: application/json' \
  -d '{"text":"傻。逼","direction":"auto","tone":"gentle"}' \
  "$API_URL/api/translate"
echo ""
