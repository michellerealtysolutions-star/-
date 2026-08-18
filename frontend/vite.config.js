// Vite 配置：React 插件 + 开发时代理到后端
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const keyPath = resolve(__dirname, "certs/key.pem");
const certPath = resolve(__dirname, "certs/cert.pem");
const hasLocalHttpsCert = existsSync(keyPath) && existsSync(certPath);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 监听所有网卡，让同一局域网的其他设备也能访问
    host: "0.0.0.0",
    // 只有本地证书存在时才启用 HTTPS；部署包不包含私钥，构建仍可正常完成
    https: hasLocalHttpsCert
      ? {
          key: readFileSync(keyPath),
          cert: readFileSync(certPath)
        }
      : undefined,
    // 开发环境下把 /api、/health 转发到后端 3001 端口
    proxy: {
      "/api": "http://localhost:3001",
      "/health": "http://localhost:3001"
    }
  }
});
