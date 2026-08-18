// 错误反馈接口：把用户提交的翻译问题追加写入本地文件，便于后续分析。
import { Router } from "express";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const router = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dirname, "../data");
const reportFile = resolve(dataDir, "reports.jsonl");

router.get("/reports/stats", async (_req, res) => {
  try {
    const raw = await readFile(reportFile, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    return res.json({ count: lines.length });
  } catch {
    return res.json({ count: 0 });
  }
});

router.post("/report", async (req, res) => {
  const { text, translation, subtext, feedback } = req.body || {};

  if (typeof feedback !== "string" || !feedback.trim()) {
    return res.status(400).json({
      error: { code: "INVALID_FEEDBACK", message: "请填写反馈内容" }
    });
  }

  const record = {
    time: new Date().toISOString(),
    text: String(text || "").slice(0, 2000),
    translation: String(translation || "").slice(0, 2000),
    subtext: String(subtext || "").slice(0, 2000),
    feedback: feedback.trim().slice(0, 2000)
  };

  try {
    await mkdir(dataDir, { recursive: true });
    await appendFile(reportFile, `${JSON.stringify(record)}\n`, "utf8");
    return res.json({ ok: true });
  } catch (error) {
    console.error("[report] write failed:", error);
    return res.status(500).json({
      error: { code: "REPORT_FAILED", message: "反馈保存失败，请稍后重试" }
    });
  }
});

export default router;
