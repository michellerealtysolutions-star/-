// 内容安全检查接口：供前端在展示 OCR 结果前调用，命中敏感内容则拒绝展示。
import { Router } from "express";
import { blockReason } from "../services/safety.js";
import { semanticBlockReason } from "../services/semanticSafety.js";

const router = Router();

router.post("/moderate", async (req, res) => {
  const { text } = req.body || {};

  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({
      error: { code: "INVALID_TEXT", message: "缺少需要检查的文字内容" }
    });
  }

  const reason = blockReason(text);
  if (reason) {
    return res.json({
      blocked: true,
      message: "这段内容涉及敏感信息，我无法处理"
    });
  }

  if (await semanticBlockReason(text)) {
    return res.json({
      blocked: true,
      message: "这段内容涉及敏感信息，我无法处理"
    });
  }

  return res.json({ blocked: false });
});

export default router;
