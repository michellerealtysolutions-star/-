// 语音/视频转写接口：接收 base64 音频或视频，统一提取音频后交给方言 ASR。
import { Router } from "express";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import multer from "multer";
import { blockReason } from "../services/safety.js";
import { semanticBlockReason } from "../services/semanticSafety.js";

const router = Router();
const MAX_MEDIA_BYTES = 80 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MEDIA_BYTES, files: 1 }
});

// 使用 ffmpeg 从视频文件中提取单声道 16kHz WAV，避免依赖浏览器的视频音频捕获能力。
async function extractAudioFromVideo(buffer, mime) {
  const extMap = {
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "video/x-matroska": "mkv",
    "video/x-msvideo": "avi"
  };
  const ext = extMap[mime] || "mp4";
  const dir = await mkdtemp(join(tmpdir(), "yuyi-video-"));
  const inputPath = join(dir, `video.${ext}`);
  const outputPath = join(dir, "audio.wav");

  try {
    await writeFile(inputPath, buffer);
    await runFfmpeg([
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      outputPath
    ]);
    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// 执行 ffmpeg，并把 stderr 拼进错误信息，便于排查视频编码问题。
function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    child.on("error", (error) => reject(new Error(`ffmpeg 启动失败：${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`视频音频提取失败：${stderr || `ffmpeg 退出码 ${code}`}`));
    });
  });
}

// 调用 OpenAI 兼容的 ASR 服务，把音频文件转成文字。
async function transcribeAudio(buffer, mime, lang) {
  const asrUrl = process.env.ASR_API_URL;
  const asrKey = process.env.ASR_API_KEY;
  const extMap = {
    "audio/webm": "webm",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/aiff": "aiff",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg"
  };
  const ext = extMap[mime] || "webm";
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mime }), `audio.${ext}`);
  form.append("model", process.env.ASR_MODEL || "whisper-1");
  if (lang) form.append("language", lang);

  const response = await fetch(
    `${asrUrl.replace(/\/+$/, "")}/audio/transcriptions`,
    {
      method: "POST",
      headers: asrKey ? { Authorization: `Bearer ${asrKey}` } : {},
      body: form
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(JSON.stringify(data));
  }

  return String(data.text || "")
    .replace(/<\|.*?\|>/g, "")
    .replace(/\[(?:UNK|PAD|MASK|EMPTY)\]/gi, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([，。！？,.!?])/g, "$1")
    .trim();
}

// 视频 multipart 上传：前端直接发送视频文件，由后端提取音频，避免 base64 内存膨胀。
router.post("/transcribe/video", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({
      error: { code: "NO_VIDEO", message: "请上传视频文件" }
    });
  }

  if (!process.env.ASR_API_URL) {
    return res.status(501).json({
      error: {
        code: "ASR_NOT_CONFIGURED",
        message: "未配置方言语音识别服务，请设置 ASR_API_URL"
      }
    });
  }

  try {
    const audioBuffer = await extractAudioFromVideo(file.buffer, file.mimetype);
    const text = await transcribeAudio(audioBuffer, "audio/wav", "auto");
    if (blockReason(text)) {
      return res.status(400).json({
        error: {
          code: "CONTENT_BLOCKED",
          message: "这段内容涉及敏感信息，我无法处理"
        }
      });
    }
    if (await semanticBlockReason(text)) {
      return res.status(400).json({
        error: {
          code: "CONTENT_BLOCKED",
          message: "这段内容涉及敏感信息，我无法处理"
        }
      });
    }
    return res.json({ text });
  } catch (error) {
    return res.status(500).json({
      error: { code: "TRANSCRIBE_FAILED", message: error.message }
    });
  }
});

router.post("/transcribe", async (req, res) => {
  const { audio_base64, video_base64, mime, lang } = req.body || {};

  // 音频或视频数据必须至少存在一种
  if (!audio_base64 && !video_base64) {
    return res.status(400).json({
      error: { code: "NO_AUDIO", message: "缺少音频或视频数据" }
    });
  }

  const asrUrl = process.env.ASR_API_URL;

  // 未配置 ASR 时返回 501，提示需要自部署 FunASR 或接入云服务
  if (!asrUrl) {
    return res.status(501).json({
      error: {
        code: "ASR_NOT_CONFIGURED",
        message: "未配置方言语音识别服务，请设置 ASR_API_URL"
      }
    });
  }

  try {
    const rawBase64 = audio_base64 || video_base64;
    const buffer = Buffer.from(rawBase64, "base64");
    if (buffer.byteLength > MAX_MEDIA_BYTES) {
      return res.status(413).json({
        error: { code: "MEDIA_TOO_LARGE", message: "上传文件过大，请控制在 80MB 以内" }
      });
    }

    let audioBuffer = buffer;
    let audioMime = mime || "audio/webm";

    if (video_base64) {
      audioBuffer = await extractAudioFromVideo(buffer, mime);
      audioMime = "audio/wav";
    }

    const text = await transcribeAudio(audioBuffer, audioMime, lang);
    // 语音识别结果同样做安全过滤，避免把敏感内容交给前端或后续翻译
    if (blockReason(text)) {
      return res.status(400).json({
        error: {
          code: "CONTENT_BLOCKED",
          message: "这段内容涉及敏感信息，我无法处理"
        }
      });
    }
    if (await semanticBlockReason(text)) {
      return res.status(400).json({
        error: {
          code: "CONTENT_BLOCKED",
          message: "这段内容涉及敏感信息，我无法处理"
        }
      });
    }
    res.json({ text });
  } catch (error) {
    res.status(500).json({
      error: { code: "TRANSCRIBE_FAILED", message: error.message }
    });
  }
});

export default router;
