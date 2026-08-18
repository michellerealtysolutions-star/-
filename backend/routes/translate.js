// 翻译接口：校验入参后调用 llm 服务，返回译文、潜台词等信息。
import { Router } from "express";
import { translate } from "../services/llm.js";
import { blockReason } from "../services/safety.js";
import { inputGuardReason } from "../services/inputGuard.js";
import { semanticBlockReason } from "../services/semanticSafety.js";

const router = Router();

// 允许的翻译方向；auto 表示由模型自动判断语言和年轻/长辈方向
const DIRECTIONS = new Set(["young_to_elder", "elder_to_young"]);
const ENGLISH_DIRECTIONS = new Set(["en_young_to_elder", "en_elder_to_young"]);
const AUTO_DIRECTION = "auto";
const TONES = new Set(["gentle", "direct"]);
const DIALECTS = new Set([
  "northeast",
  "sichuan",
  "cantonese",
  "henan",
  "shanghainese"
]);
const cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;

router.post("/translate", async (req, res) => {
  const { text, direction, dialect, tone } = req.body || {};

  // 逐项校验入参，给出明确的错误码
  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({
      error: { code: "INVALID_TEXT", message: "请输入要翻译的内容" }
    });
  }

  if (
    direction !== AUTO_DIRECTION &&
    !DIRECTIONS.has(direction) &&
    !ENGLISH_DIRECTIONS.has(direction)
  ) {
    return res.status(400).json({
      error: {
        code: "INVALID_DIRECTION",
        message: "direction 无效"
      }
    });
  }

  if (text.trim().length > 2000) {
    return res.status(400).json({
      error: { code: "TEXT_TOO_LONG", message: "文本过长，请控制在 2000 字以内" }
    });
  }

  // 只允许中文或英文；明显无逻辑的乱码也直接拒绝
  const guardReason = inputGuardReason(text);
  if (guardReason === "NON_CN_EN") {
    return res.status(400).json({
      error: {
        code: "UNSUPPORTED_LANGUAGE",
        message: "目前只支持中文或英文"
      }
    });
  }
  if (guardReason === "INCOHERENT") {
    return res.status(400).json({
      error: {
        code: "INCOHERENT_INPUT",
        message: "输入内容看起来没有明确含义，请重新输入"
      }
    });
  }
  if (guardReason === "UNSAFE") {
    return res.status(400).json({
      error: {
        code: "UNSAFE_INPUT",
        message: "输入内容不安全，请重新输入"
      }
    });
  }

  // 命中色情、暴力或政治敏感内容时，不进入翻译，直接拦截
  if (blockReason(text)) {
    return res.status(400).json({
      error: {
        code: "CONTENT_BLOCKED",
        message: "这个问题涉及敏感内容，我无法回答"
      }
    });
  }

  // 可选第二层：大模型语义安全审核，默认关闭。
  const semanticReason = await semanticBlockReason(text);
  if (semanticReason) {
    return res.status(400).json({
      error: {
        code: "CONTENT_BLOCKED",
        message: "这个问题涉及敏感内容，我无法回答"
      }
    });
  }

  if (dialect && !DIALECTS.has(dialect)) {
    return res.status(400).json({
      error: { code: "UNKNOWN_DIALECT", message: "暂不支持该方言" }
    });
  }

  if (tone && !TONES.has(tone)) {
    return res.status(400).json({
      error: { code: "INVALID_TONE", message: "tone 必须是 gentle 或 direct" }
    });
  }

  const cacheKey = JSON.stringify({
    text: text.trim(),
    direction,
    dialect: dialect || null,
    tone: tone || "gentle"
  });
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json(cached.data);
  }

  // 调用核心翻译逻辑，成功则返回结构化结果
  try {
    const result = await translate({
      text: text.trim(),
      direction,
      dialect: dialect || null,
      tone: tone || "gentle"
    });
    cache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
    if (cache.size > CACHE_MAX) {
      cache.delete(cache.keys().next().value);
    }
    return res.json(result);
  } catch (error) {
    console.error("[translate] unexpected error:", error);
    return res.status(500).json({
      error: {
        code: "TRANSLATE_FAILED",
        message: "翻译失败，请稍后重试"
      }
    });
  }
});

export default router;
