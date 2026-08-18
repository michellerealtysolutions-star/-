// 统一的 API 请求封装：拼接基地址、解析 JSON、统一错误提示
const API_BASE = import.meta.env.VITE_API_BASE || "";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || "请求失败，请稍后重试");
  }
  return data;
}

async function upload(path, formData) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    body: formData
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || "上传失败，请稍后重试");
  }
  return data;
}

// 对外的接口集合
export const api = {
  // 代际翻译
  translate: (text, direction, dialect, tone) =>
    request("/api/translate", {
      method: "POST",
      body: JSON.stringify({ text, direction, dialect, tone })
    }),
  // 语音/视频转写（方言识别）
  transcribe: (audioBase64, mime, lang) =>
    request("/api/transcribe", {
      method: "POST",
      body: JSON.stringify({ audio_base64: audioBase64, mime, lang })
    }),
  // 视频转写：直接把视频文件交给后端，由后端提取音频并识别
  transcribeVideo: (file, lang = "auto") => {
    const form = new FormData();
    form.append("file", file, file.name || "video.mp4");
    if (lang) form.append("lang", lang);
    return upload("/api/transcribe/video", form);
  },
  // 图片 OCR 结果的内容安全预检
  moderate: (text) =>
    request("/api/moderate", {
      method: "POST",
      body: JSON.stringify({ text })
    }),
  // 用户反馈错误翻译
  report: (payload) =>
    request("/api/report", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  // 反馈数量统计
  reportStats: () =>
    request("/api/reports/stats", {
      method: "GET"
    })
};
