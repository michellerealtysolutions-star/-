#!/usr/bin/env bash
# 自部署启动脚本：创建虚拟环境、安装依赖、下载模型并启动服务。
set -e
cd "$(dirname "$0")"

# 首次运行才创建虚拟环境
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi

source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# 允许通过环境变量覆盖模型、设备和端口
export FUNASR_MODEL="${FUNASR_MODEL:-iic/SenseVoiceSmall}"
export FUNASR_DEVICE="${FUNASR_DEVICE:-cpu}"
export FUNASR_PORT="${FUNASR_PORT:-10095}"

echo "FunASR 服务启动中（首次运行会自动下载模型）：http://127.0.0.1:${FUNASR_PORT}"
uvicorn server:app --host 0.0.0.0 --port "${FUNASR_PORT}"
