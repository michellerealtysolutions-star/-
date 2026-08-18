// 后端边界测试：覆盖输入校验、超长文本、非法参数、离线翻译与转写未配置等场景。
import express from "express";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import translateRouter from "../routes/translate.js";
import transcribeRouter from "../routes/transcribe.js";
import moderateRouter from "../routes/moderate.js";
import reportRouter from "../routes/report.js";

let server;
let base;

before(
  () =>
    new Promise((resolve) => {
      const app = express();
      app.use(express.json({ limit: "25mb" }));
      app.use("/api", translateRouter);
      app.use("/api", transcribeRouter);
      app.use("/api", moderateRouter);
      app.use("/api", reportRouter);
      app.use((error, _req, res, _next) => {
        if (error?.type === "entity.parse.failed") {
          return res.status(400).json({
            error: { code: "INVALID_JSON", message: "请求体不是合法的 JSON" }
          });
        }
        if (error?.type === "entity.too.large") {
          return res.status(413).json({
            error: { code: "PAYLOAD_TOO_LARGE", message: "上传内容过大" }
          });
        }
        return res.status(500).json({
          error: { code: "SERVER_ERROR", message: "服务器内部错误" }
        });
      });

      server = app.listen(0, "127.0.0.1", () => {
        base = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    })
);

after(
  () =>
    new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(() => resolve());
    })
);

async function post(path, body) {
  const response = await fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

test("翻译：空字符串返回 400", async () => {
  const { status, data } = await post("/api/translate", { text: "", direction: "auto" });
  assert.equal(status, 400);
  assert.equal(data.error.code, "INVALID_TEXT");
});

test("翻译：纯空白文本返回 400", async () => {
  const { status, data } = await post("/api/translate", { text: "   ", direction: "auto" });
  assert.equal(status, 400);
  assert.equal(data.error.code, "INVALID_TEXT");
});

test("翻译：非中英文语言返回 400", async () => {
  const { status, data } = await post("/api/translate", {
    text: "こんにちは",
    direction: "auto"
  });
  assert.equal(status, 400);
  assert.equal(data.error.code, "UNSUPPORTED_LANGUAGE");
});

test("翻译：明显无逻辑的乱码返回 400", async () => {
  const { status, data } = await post("/api/translate", {
    text: "bcdfghjklmnpqrstvwxz",
    direction: "auto"
  });
  assert.equal(status, 400);
  assert.equal(data.error.code, "INCOHERENT_INPUT");
});

test("翻译：XSS 内容返回 400", async () => {
  const { status, data } = await post("/api/translate", {
    text: "<script>alert(1)</script>",
    direction: "auto"
  });
  assert.equal(status, 400);
  assert.equal(data.error.code, "UNSAFE_INPUT");
});

test("翻译：SQL 注入内容返回 400", async () => {
  const { status, data } = await post("/api/translate", {
    text: "' OR '1'='1",
    direction: "auto"
  });
  assert.equal(status, 400);
  assert.equal(data.error.code, "UNSAFE_INPUT");
});

test("翻译：缺少 text 字段返回 400", async () => {
  const { status, data } = await post("/api/translate", { direction: "auto" });
  assert.equal(status, 400);
  assert.equal(data.error.code, "INVALID_TEXT");
});

test("翻译：超过 2000 字返回 400", async () => {
  const { status, data } = await post("/api/translate", {
    text: "a".repeat(2001),
    direction: "auto"
  });
  assert.equal(status, 400);
  assert.equal(data.error.code, "TEXT_TOO_LONG");
});

test("翻译：非法方向返回 400", async () => {
  const { status, data } = await post("/api/translate", {
    text: "你好",
    direction: "foo"
  });
  assert.equal(status, 400);
  assert.equal(data.error.code, "INVALID_DIRECTION");
});

test("翻译：缺少方向返回 400", async () => {
  const { status, data } = await post("/api/translate", { text: "你好" });
  assert.equal(status, 400);
  assert.equal(data.error.code, "INVALID_DIRECTION");
});

test("翻译：非法语气返回 400", async () => {
  const { status, data } = await post("/api/translate", {
    text: "你好",
    direction: "auto",
    tone: "angry"
  });
  assert.equal(status, 400);
  assert.equal(data.error.code, "INVALID_TONE");
});

test("翻译：非法方言返回 400", async () => {
  const { status, data } = await post("/api/translate", {
    text: "你好",
    direction: "auto",
    dialect: "xxx"
  });
  assert.equal(status, 400);
  assert.equal(data.error.code, "UNKNOWN_DIALECT");
});

test("翻译：中文年轻话自动识别为 young_to_elder", async () => {
  const { status, data } = await post("/api/translate", {
    text: "我 emo 了，想摆烂",
    direction: "auto",
    tone: "gentle"
  });
  assert.equal(status, 200);
  assert.equal(data.detected_direction, "young_to_elder");
  assert.ok(data.translation);
  assert.ok(data.subtext);
});

test("翻译：中文长辈话自动识别为 elder_to_young", async () => {
  const { status, data } = await post("/api/translate", {
    text: "你怎么还不结婚？",
    direction: "auto",
    tone: "gentle"
  });
  assert.equal(status, 200);
  assert.equal(data.detected_direction, "elder_to_young");
  assert.ok(data.translation);
  assert.ok(data.subtext);
});

test("翻译：英文年轻俚语自动识别为 young_to_elder", async () => {
  const { status, data } = await post("/api/translate", {
    text: "This movie is mid, no cap",
    direction: "auto",
    tone: "gentle"
  });
  assert.equal(status, 200);
  assert.equal(data.detected_direction, "young_to_elder");
  assert.ok(data.translation);
});

test("翻译：英文正式表达自动识别为 elder_to_young", async () => {
  const { status, data } = await post("/api/translate", {
    text: "I am going to attend the meeting",
    direction: "auto",
    tone: "gentle"
  });
  assert.equal(status, 200);
  assert.equal(data.detected_direction, "elder_to_young");
  assert.ok(data.translation);
});

test("翻译：中性句子不需要代际翻译", async () => {
  const { status, data } = await post("/api/translate", {
    text: "今天天气不错，我们出去走走吧。",
    direction: "auto",
    tone: "gentle"
  });
  assert.equal(status, 200);
  assert.equal(data.needs_translation, false);
  assert.equal(data.detected_direction, null);
  assert.equal(data.translation, "今天天气不错，我们出去走走吧。");
});

test("翻译：网络梗应被识别为年轻表达", async () => {
  const { status, data } = await post("/api/translate", {
    text: "这波操作我真的会谢，社死了",
    direction: "auto",
    tone: "gentle"
  });
  assert.equal(status, 200);
  assert.equal(data.detected_direction, "young_to_elder");
  assert.ok(data.translation);
  assert.ok(data.subtext);
});

test("翻译：单独出现的热梗不需要代际翻译", async () => {
  const { status, data } = await post("/api/translate", {
    text: "中国人能飞",
    direction: "auto",
    tone: "gentle"
  });
  assert.equal(status, 200);
  assert.equal(data.needs_translation, false);
  assert.equal(data.detected_direction, null);
  assert.equal(data.translation, "中国人能飞");
  assert.ok(data.subtext);
});

test("翻译：单独热梗应返回准确的梗类别和具体含义", async () => {
  const { status, data } = await post("/api/translate", {
    text: "yyds",
    direction: "auto",
    tone: "gentle"
  });
  assert.equal(status, 200);
  assert.equal(data.meme.category, "缩写梗");
  assert.match(data.meme.meaning, /永远的神/);
});

test("翻译：句子中的多个梗应合并为独立梗字段", async () => {
  const { status, data } = await post("/api/translate", {
    text: "这波操作我真的会谢，社死了",
    direction: "auto",
    tone: "gentle"
  });
  assert.equal(status, 200);
  assert.ok(data.meme);
  assert.match(data.meme.category, /反讽梗/);
  assert.match(data.meme.category, /场景梗/);
  assert.match(data.meme.meaning, /社死/);
});

test("翻译：英语俚语梗应返回英语梗类别", async () => {
  const { status, data } = await post("/api/translate", {
    text: "This movie is mid, no cap",
    direction: "auto",
    tone: "gentle"
  });
  assert.equal(status, 200);
  assert.match(data.meme.category, /英语俚语梗/);
  assert.match(data.meme.meaning, /mid|no cap/i);
});

test("翻译：英文年轻口语离线兜底会展开弱读和缩写", async () => {
  const { status, data } = await post("/api/translate", {
    text: "I'm gonna head out, no cap",
    direction: "en_young_to_elder",
    tone: "gentle"
  });
  assert.equal(status, 200);
  assert.match(data.translation, /I am going to/i);
  assert.match(data.subtext, /no cap/i);
});

test("转写：缺少音频返回 400", async () => {
  const { status, data } = await post("/api/transcribe", {});
  assert.equal(status, 400);
  assert.equal(data.error.code, "NO_AUDIO");
});

test("转写：未配置 ASR 返回 501", async () => {
  const { status, data } = await post("/api/transcribe", {
    audio_base64: "dGVzdA==",
    mime: "audio/webm",
    lang: "auto"
  });
  assert.equal(status, 501);
  assert.equal(data.error.code, "ASR_NOT_CONFIGURED");
});

test("转写：视频数据在未配置 ASR 时也返回 501", async () => {
  const { status, data } = await post("/api/transcribe", {
    video_base64: "dGVzdA==",
    mime: "video/mp4",
    lang: "auto"
  });
  assert.equal(status, 501);
  assert.equal(data.error.code, "ASR_NOT_CONFIGURED");
});

test("转写：multipart 视频上传缺少文件返回 400", async () => {
  const form = new FormData();
  const response = await fetch(`${base}/api/transcribe/video`, {
    method: "POST",
    body: form
  });
  const data = await response.json();
  assert.equal(response.status, 400);
  assert.equal(data.error.code, "NO_VIDEO");
});

test("翻译：色情内容被拦截", async () => {
  const { status, data } = await post("/api/translate", {
    text: "我想看色情内容",
    direction: "auto",
    tone: "gentle"
  });
  assert.equal(status, 400);
  assert.equal(data.error.code, "CONTENT_BLOCKED");
});

test("翻译：暴力内容被拦截", async () => {
  const { status, data } = await post("/api/translate", {
    text: "我要杀人",
    direction: "auto",
    tone: "gentle"
  });
  assert.equal(status, 400);
  assert.equal(data.error.code, "CONTENT_BLOCKED");
});

test("翻译：政治敏感内容被拦截", async () => {
  const { status, data } = await post("/api/translate", {
    text: "台湾独立",
    direction: "auto",
    tone: "gentle"
  });
  assert.equal(status, 400);
  assert.equal(data.error.code, "CONTENT_BLOCKED");
});

test("翻译：直接辱骂内容被拦截", async () => {
  const { status, data } = await post("/api/translate", {
    text: "傻逼",
    direction: "auto",
    tone: "gentle"
  });
  assert.equal(status, 400);
  assert.equal(data.error.code, "CONTENT_BLOCKED");
});

test("翻译：用标点隔开的辱骂内容也被拦截", async () => {
  const { status, data } = await post("/api/translate", {
    text: "傻。逼",
    direction: "auto",
    tone: "gentle"
  });
  assert.equal(status, 400);
  assert.equal(data.error.code, "CONTENT_BLOCKED");
});

test("内容预检：敏感图片文字返回 blocked", async () => {
  const { status, data } = await post("/api/moderate", {
    text: "我要杀人"
  });
  assert.equal(status, 200);
  assert.equal(data.blocked, true);
});

test("内容预检：普通图片文字放行", async () => {
  const { status, data } = await post("/api/moderate", {
    text: "今天天气不错"
  });
  assert.equal(status, 200);
  assert.equal(data.blocked, false);
});

test("反馈：缺少反馈内容返回 400", async () => {
  const { status, data } = await post("/api/report", {
    text: "你好",
    translation: "你好",
    subtext: "",
    feedback: ""
  });
  assert.equal(status, 400);
  assert.equal(data.error.code, "INVALID_FEEDBACK");
});

test("服务：非法 JSON 返回 400", async () => {
  const response = await fetch(base + "/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{"
  });
  const data = await response.json().catch(() => ({}));
  assert.equal(response.status, 400);
  assert.equal(data.error.code, "INVALID_JSON");
});
