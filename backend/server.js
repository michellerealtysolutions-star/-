// 服务端入口：加载环境变量、创建 Express 应用、挂载业务路由并统一处理错误。
import "dotenv/config";
import express from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import translateRouter from "./routes/translate.js";
import transcribeRouter from "./routes/transcribe.js";
import moderateRouter from "./routes/moderate.js";
import reportRouter from "./routes/report.js";

const app = express();
const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendDist = resolve(__dirname, "../frontend/dist");
const PORT = Number(process.env.PORT || 3001);
const rateWindowMs = Number(process.env.RATE_WINDOW_MS || 60000);
const rateLimit = Number(process.env.RATE_LIMIT || 120);
const requestLog = new Map();
const configuredOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (configuredOrigins.length) return configuredOrigins.includes(origin);
  // 默认只允许本机和常见局域网地址
  return /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$/.test(origin);
}

// 允许跨域，并解析 JSON 请求体
app.use(
  cors({
    origin(origin, callback) {
      callback(null, isAllowedOrigin(origin));
    }
  })
);
// 音频和视频以 base64 传输，体积较大，这里放宽到 80MB
app.use(express.json({ limit: "80mb" }));

// 简单的按 IP 限流，避免公开演示时被高频请求拖垮
app.use((req, res, next) => {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const now = Date.now();
  const windowStart = now - rateWindowMs;

  const hits = (requestLog.get(ip) || []).filter((time) => time > windowStart);
  if (hits.length >= rateLimit) {
    return res.status(429).json({
      error: { code: "RATE_LIMITED", message: "请求过于频繁，请稍后再试" }
    });
  }

  hits.push(now);
  requestLog.set(ip, hits);
  next();
});

// 健康检查，便于部署探活
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// 业务路由：代际翻译 + 语音/视频转写
app.use("/api", translateRouter);
app.use("/api", transcribeRouter);
app.use("/api", moderateRouter);
app.use("/api", reportRouter);

// 生产模式下，如果前端已经构建，则由后端直接托管静态页面
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/health")) return next();
    res.sendFile(resolve(frontendDist, "index.html"));
  });
}

// 未匹配路由的兜底响应
app.use((_req, res) => {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: "接口不存在" }
  });
});

// 统一错误处理，避免把堆栈信息直接暴露给前端
app.use((error, _req, res, _next) => {
  console.error("[server] unhandled error:", error);
  // 请求体不是合法 JSON 时，明确返回 400，而不是笼统的 500
  if (error?.type === "entity.parse.failed") {
    return res.status(400).json({
      error: { code: "INVALID_JSON", message: "请求体不是合法的 JSON" }
    });
  }
  // 请求体超过限制时，返回更明确的 413
  if (error?.type === "entity.too.large") {
    return res.status(413).json({
      error: { code: "PAYLOAD_TOO_LARGE", message: "上传内容过大" }
    });
  }
  if (error?.name === "MulterError") {
    const code = error.code === "LIMIT_FILE_SIZE" ? "MEDIA_TOO_LARGE" : "UPLOAD_ERROR";
    return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
      error: { code, message: error.code === "LIMIT_FILE_SIZE" ? "上传文件过大，请控制在 80MB 以内" : error.message }
    });
  }
  res.status(500).json({
    error: { code: "SERVER_ERROR", message: "服务器内部错误" }
  });
});

// 启动 HTTP 服务；绑定所有网卡，方便局域网访问
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Generational translator backend listening on http://localhost:${PORT}`);
});
