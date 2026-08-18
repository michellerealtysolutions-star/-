# 语译 · 沟通翻译器项目文档

## 1. 项目概述

语译是一款面向代际沟通的网页工具。它不进行传统的中英互译，而是把“年轻表达”和“长辈表达”互相转译，帮助不同代际的人理解彼此真正想说的话。

用户可以使用同一个输入框输入文字，也可以使用语音、音频上传、图片识别、视频提取音频等方式输入内容。系统会自动判断语言、判断年轻话/长辈话/无需翻译，并输出成品译文和说明。

## 2. 核心目标

- 降低家庭沟通中的代沟和误解。
- 让网络梗、方言、俚语、潜台词变得可理解。
- 提供文字、语音、图片、视频多模态输入。
- 保证内容安全，拦截敏感和恶意输入。
- 支持局域网访问和移动端演示。

## 3. 主要功能

### 3.1 输入方式

- 文字输入
- 麦克风录音
- 本地音频文件上传
- 图片 OCR 识别
- 视频提取音频后识别

### 3.2 翻译能力

- 中英文自动识别
- 年轻话 / 长辈话自动判断
- 无需翻译的中性句子原样返回
- 方言自动识别
- 网络梗、俚语、习语解释
- 单独出现的网络梗：不翻译，但解释含义
- 句内网络梗：翻译成对方容易理解的说法并解释

### 3.3 安全能力

- 色情、暴力、政治敏感内容拦截
- XSS、SQL 注入等恶意输入拦截
- 非中英文语言拒绝
- 明显乱码拒绝
- CORS 白名单
- 接口限流
- 音频文件大小限制
- 图片 OCR 结果预检

### 3.4 体验功能

- 译文朗读
- 历史记录与收藏
- 大字模式
- 快捷示例
- 隐私说明
- 错误反馈
- 翻译结果缓存

### 3.5 部署与演示

- 本地 HTTPS 访问
- 局域网访问
- 基础 PWA 能力
- 生产静态托管
- 一键演示脚本

## 4. 技术架构

### 4.1 前端

- React 18
- Vite
- Tesseract.js（图片 OCR）
- 浏览器 MediaRecorder（录音和视频音频提取）
- 浏览器 SpeechSynthesis（译文朗读）

### 4.2 后端

- Node.js
- Express
- DeepSeek 兼容 API
- FunASR（本地方言语音识别）

### 4.3 目录结构

```text
hackson/
├── frontend/             # 主前端
│   ├── public/           # 静态资源、PWA、Tesseract 本地 worker/core
│   ├── src/              # React 源码
│   ├── certs/            # 本地 HTTPS 自签名证书
│   └── test/             # 前端单元测试
├── backend/              # 后端服务
│   ├── routes/           # API 路由
│   ├── services/         # LLM、安全、输入校验等
│   ├── prompts/          # 提示词模板
│   ├── config/           # 敏感词配置
│   ├── test/             # 后端边界测试
│   └── server.js
├── deploy/funasr/        # 方言语音识别服务
├── demo/                 # 一键演示脚本
├── start-production.sh   # 生产启动脚本
├── PROJECT.md            # 本文档
└── README.md
```

## 5. 接口设计

### `POST /api/translate`

代际翻译接口。

请求：

```json
{
  "text": "我 emo 了，想摆烂",
  "direction": "auto",
  "dialect": null,
  "tone": "gentle"
}
```

响应：

```json
{
  "translation": "我心情不太好，想休息一下，什么都不想干。",
  "subtext": "“emo”指情绪低落，“摆烂”指放弃努力。",
  "tone": "gentle",
  "dialect_used": null,
  "detected_direction": "young_to_elder",
  "needs_translation": true
}
```

### `POST /api/transcribe`

语音转写接口，接收 base64 音频，转发给 FunASR。

### `POST /api/moderate`

图片 OCR 文本安全预检。

### `POST /api/report`

提交错误反馈。

### `GET /api/reports/stats`

反馈数量统计。

### `GET /health`

健康检查。

## 6. 环境变量

后端 `.env` 主要变量：

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `MODEL_API_KEY` | DeepSeek API Key | 空 |
| `MODEL_BASE_URL` | OpenAI 兼容接口地址 | `https://api.deepseek.com` |
| `MODEL_NAME` | 模型名 | `deepseek-chat` |
| `MODEL_TIMEOUT_MS` | 模型请求超时 | `30000` |
| `PORT` | 后端端口 | `3001` |
| `ASR_API_URL` | 方言语音识别地址 | 空 |
| `ASR_API_KEY` | 语音识别 Key | 空 |
| `ASR_MODEL` | 语音识别模型 | `whisper-1` |
| `CORS_ORIGINS` | 可选 CORS 白名单 | 空 |
| `RATE_LIMIT` | 每 IP 每分钟请求上限 | `120` |

## 7. 本地运行

### 7.1 后端

```bash
cd backend
npm install
npm run dev
```

### 7.2 前端

```bash
cd frontend
npm install
npm run dev
```

访问：

- `https://localhost:5173`

### 7.3 方言语音识别

```bash
cd deploy/funasr
bash run.sh
```

### 7.4 生产模式

```bash
./start-production.sh
```

后端会同时托管 API 和 `frontend/dist` 静态文件。

## 8. 测试

### 后端

```bash
cd backend
npm test
```

覆盖输入校验、翻译方向、网络梗、安全拦截、非法 JSON、反馈接口等。

### 前端

```bash
cd frontend
npm test
npm run build
```

覆盖中文识别、麦克风错误映射、ASR 降级提示。

## 9. 安全设计

- 敏感词库可配置：`backend/config/content-policy.json`
- 输入合法性检查：`backend/services/inputGuard.js`
- 内容安全过滤：`backend/services/safety.js`
- CORS 白名单：`backend/server.js`
- 限流：`backend/server.js`
- 音频大小限制：`backend/routes/transcribe.js`
- 图片 OCR 预检：`backend/routes/moderate.js`

## 10. 已知限制

- 当前只支持中文和英文。
- 方言语音识别依赖本地 FunASR，首次启动需要下载模型。
- 手机通过局域网 HTTP 访问时，麦克风可能被浏览器限制，需使用 HTTPS。
- OCR 语言包仍可能从 CDN 加载；worker 和 core 已本地化。
- 翻译质量依赖 DeepSeek 模型和提示词，复杂语境下可能仍需人工判断。

## 11. 后续可扩展方向

- 关系对象选择：对爸爸、妈妈、爷爷、奶奶等不同对象调整表达。
- 多轮对话上下文。
- 译文语音音色选择。
- 更多方言支持。
- 更专业的语言识别模型。
- 前端交互自动化测试。
- 管理后台查看反馈和统计。
