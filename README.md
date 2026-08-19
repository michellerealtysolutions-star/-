# 语译 · 沟通翻译器

一个统一的代际翻译工具：同一个输入框，中英文自动识别，方向也自动判断。

- **中文**：年轻话 ↔ 长辈话，支持方言、语气调节，并解释潜台词。
- **英文**：年轻英语 ↔ 长辈英语，解释俚语、习语、网络流行语。
- **语音输入**：录音后由后端 ASR 自动识别语言与方言，不再依赖浏览器自带识别。
- **音频上传**：选择本地音频文件后，走与录音相同的方言识别与翻译流程。
- **图片识别**：上传图片，自动识别其中的文字并填入输入框。
- **译文朗读**：可用浏览器语音直接播放翻译结果。
- **历史记录与收藏**：翻译记录保存在本地浏览器。
- **大字模式**：适合长辈阅读。
- **手机拍照识别**：图片输入支持直接调用相机。

大模型未配置时，代际翻译走本地规则兜底，英语口语化走规则改写，均可离线演示；配置大模型后获得完整翻译能力。

## 功能

- 中英文自动识别，同一个输入框完成代际翻译
- 自动判断年轻话 / 长辈话 / 无需翻译，无需手动切换方向
- 重点识别网络梗、缩写、圈层黑话，并在说明中解释梗的含义
- 单独出现的网络梗不强行翻译，直接原样返回
- 单独出现的网络梗会给出解释，但不做代际改写
- 色情、暴力、政治敏感内容会在进入翻译前被拦截
- 语音、图片、视频中的文字识别结果同样会先做安全预检
- 只支持中文和英文输入；明显无逻辑的乱码会被拒绝
- XSS、SQL 注入等明显不安全输入会被拒绝
- CORS 已限制为本机或局域网白名单
- 翻译结果支持缓存，重复请求更快
- 接口有限流和音频大小限制
- 敏感词库支持通过配置文件调整
- 支持隐私说明和错误反馈
- 提供基础 PWA 安装能力
- 首页提供一键示例
- 提供 `demo/demo.sh` 自动演示脚本
- 后端与前端均有基础自动化测试
- 语音 / 音频 / 图片 / 视频四种输入统一到一个输入框
- 中文：自动识别方言并转为标准普通话，语气（温和 / 直接）、潜台词
- 英文：年轻英语 ↔ 长辈英语，俚语 / 习语解释
- 语音输入：录音后调用 FunASR，自动识别语言与方言
- 方言自动识别：语音 / 视频 / 文字中的方言自动识别（语音、视频需配置 FunASR）
- 图片识别文字：基于 Tesseract.js（中英文）
- 视频转写：提取视频音频后调用方言 ASR（需配置）
- 离线兜底：本地示例、规则翻译、口语化缩写转换

## 目录结构

```text
.
├── frontend/   # React + Vite
├── backend/    # Node.js + Express
└── README.md
```

## 本地运行

### 1. 配置大模型（可选）

```bash
cd backend
cp .env.example .env
```

填写 `MODEL_API_KEY`。默认使用 DeepSeek 兼容接口。不填也能运行，走离线兜底。

### 2. 启动后端

```bash
cd backend
npm install
npm run dev
```

后端默认运行在 `http://localhost:3001`。

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
```

打开 `http://localhost:5173`。如果本地存在 `frontend/certs/`，Vite 会自动切换为 `https://localhost:5173`。

### 生产模式

```bash
cd 项目根目录
./start-production.sh
```

该脚本会在首次运行时自动安装前后端依赖，然后依次启动 FunASR 方言识别服务、构建前端，并由后端同时托管 API 和前端静态文件。默认地址为 `http://localhost:3001`。

### 自动演示

```bash
./demo/demo.sh
```

默认只在本机运行。如需使用麦克风，请使用 HTTPS 地址。仓库已内置本地自签名证书：

- `https://localhost:5173`（本机）

首次访问会提示证书不受信任，选择“继续访问”即可。证书文件位于 `frontend/certs/`，已被 `.gitignore` 忽略。

## 接口

### `POST /api/translate`

请求：

```json
{
  "text": "我 emo 了，想摆烂",
  "direction": "young_to_elder",
  "dialect": "sichuan",
  "tone": "gentle"
}
```

`direction` 可选：

- `young_to_elder`：年轻话 → 长辈话
- `elder_to_young`：长辈话 → 年轻话
- `en_young_to_elder`：年轻英语 → 长辈英语（解释俚语习语）
- `en_elder_to_young`：长辈英语 → 年轻英语（口语化）
- `auto`：自动判断语言与年轻/长辈方向

响应：

```json
{
  "translation": "译文",
  "subtext": "潜台词或口语化说明",
  "tone": "gentle",
  "dialect_used": "sichuan"
}
```

### `GET /health`

返回 `{ "status": "ok" }`。

## 环境变量

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `MODEL_API_KEY` | 大模型 API Key，留空则走离线兜底 | 空 |
| `MODEL_BASE_URL` | OpenAI 兼容接口地址 | `https://api.deepseek.com` |
| `MODEL_NAME` | 模型名 | `deepseek-chat` |
| `MODEL_TIMEOUT_MS` | 请求超时毫秒数 | `30000` |
| `PORT` | 后端端口 | `3001` |
| `ASR_API_URL` | 方言语音识别接口地址（OpenAI 兼容） | 空 |
| `ASR_API_KEY` | 方言语音识别 Key | 空 |
| `ASR_MODEL` | 语音识别模型名 | `whisper-1` |

## 方言语音识别方案

浏览器自带的语音识别不支持方言，因此语音/视频/方言转写统一走后端 `/api/transcribe`，兼容 OpenAI 的 `/audio/transcriptions` 协议。可选：

- **讯飞语音听写 WebAPI**：支持普通话、粤语（cantonese）、四川话（lmz）等，RESTful 调用。
- **腾讯云 ASR（Hy-ASR / 16k_zh_en）**：支持粤语、东北话、河南话、四川话、上海话等 20+ 方言。
- **FunASR（开源，推荐自部署）**：支持 7 大方言 + 26 种地域口音，提供 OpenAI 兼容服务，可本地部署、不按次收费。

配置 `ASR_API_URL` 后，视频上传会自动提取音频并转写；未配置时视频转写会返回提示。

## 自部署 FunASR（本地方言识别）

仓库已提供一套可直接运行的 FunASR 服务（Python + FastAPI，OpenAI 兼容接口）：

```bash
cd deploy/funasr
bash run.sh
```

首次运行会自动：

1. 创建虚拟环境并安装依赖（含 torch、funasr，体积较大）
2. 从 ModelScope 下载模型（默认 `iic/SenseVoiceSmall`，约 1GB）
3. 启动服务到 `http://127.0.0.1:10095`

后端 `backend/.env` 已默认指向：

```bash
ASR_API_URL=http://127.0.0.1:10095
```

启动顺序：先 `bash deploy/funasr/run.sh`，再启动后端和前端，视频上传即可走本地 FunASR 转写。

说明：

- 默认模型 `SenseVoiceSmall` 支持中文、粤语、英语等，CPU 可运行；若需更强的四川话、东北话等方言，可换成 `Fun-ASR-Nano`（对硬件要求更高）。
- 首次下载依赖和模型耗时较长，请保证网络与磁盘空间（约 3GB+）。
