# 语译部署上传说明

## 方式一：rsync 轻量上传

本方式只上传源码和前端构建产物，不上传：

- `node_modules`
- `backend/.env`
- `frontend/certs`
- 模型缓存

### 1. 设置服务器信息

```bash
export DEPLOY_USER=root
export DEPLOY_HOST=你的服务器IP或域名
export DEPLOY_PATH=/opt/yuyi
```

### 2. 上传

```bash
bash deploy/upload.sh
```

### 3. 服务器安装与启动

```bash
cd /opt/yuyi
cd backend
npm install
cd ../frontend
npm install
npm run build
cd ..
./start-production.sh
```

### 4. 配置密钥

在服务器上创建后端环境变量：

```bash
cd /opt/yuyi/backend
cp .env.example .env
nano .env
```

至少需要：

```bash
MODEL_API_KEY=你的DeepSeek密钥
MODEL_BASE_URL=https://api.deepseek.com
MODEL_NAME=deepseek-chat
PORT=3001
```

## 方式二：上传完整压缩包

如果平台只支持上传单个文件，可使用已经生成的：

```text
yuyi-deploy-package.tar.gz
```

但该包已排除密钥、依赖和证书，仍需在部署平台手动设置环境变量。
