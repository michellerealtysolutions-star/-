// 前端纯函数工具，便于单元测试。
export function isChinese(text) {
  return /[\u4e00-\u9fff]/.test(String(text || ""));
}

export function micError(err) {
  const name = err?.name || "";
  if (/NotAllowed|PermissionDenied/i.test(name)) return "请允许浏览器使用麦克风";
  if (/NotFound/i.test(name)) return "未检测到麦克风设备";
  if (/NotReadable|TrackStart/i.test(name)) return "麦克风被占用，请关闭其他录音应用";
  return "无法使用麦克风";
}

export function asrError(err) {
  const message = err?.message || "";
  if (/ASR_NOT_CONFIGURED|TRANSCRIBE_FAILED|无法|失败|not configured|failed/i.test(message)) {
    return "语音识别服务暂时不可用，可以改用文字输入，或上传图片来识别。";
  }
  return message;
}
