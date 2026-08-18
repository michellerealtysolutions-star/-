// 分析用户反馈，生成常见误翻榜单和规则建议。
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const reportFile = resolve(__dirname, "../data/reports.jsonl");
const markdownFile = resolve(__dirname, "../data/feedback-report.md");
const suggestionsFile = resolve(__dirname, "../data/feedback-rule-suggestions.json");

function classify(record) {
  const haystack = [
    record.feedback || "",
    record.text || "",
    record.translation || "",
    record.subtext || ""
  ].join(" ");

  if (/梗|网络语|俚语|meme|解释/.test(haystack)) return "梗解释不准";
  if (/方言|粤语|四川|东北|河南|上海/.test(haystack)) return "方言错误";
  if (/语气|生硬|太直接|冒犯|说教|温柔/.test(haystack)) return "语气不合适";
  if (/安全|拦截|敏感|辱骂|色情|暴力|政治|漏拦/.test(haystack)) return "安全漏拦";
  if (/不通顺|别扭|翻译错|直译|不自然|看不懂/.test(haystack)) return "翻译不自然";
  return "其他";
}

async function main() {
  let records = [];
  try {
    const raw = await readFile(reportFile, "utf8");
    records = raw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    records = [];
  }

  if (!records.length) {
    console.log("当前没有用户反馈数据。");
    await writeFile(markdownFile, "# 反馈分析报告\n\n当前没有用户反馈数据。\n", "utf8");
    await writeFile(suggestionsFile, JSON.stringify({ generatedAt: new Date().toISOString(), records: 0, categories: [], suggestions: [] }, null, 2), "utf8");
    return;
  }

  const counts = new Map();
  const samples = new Map();
  for (const record of records) {
    const category = classify(record);
    counts.set(category, (counts.get(category) || 0) + 1);
    if (!samples.has(category)) samples.set(category, []);
    if (samples.get(category).length < 8) samples.get(category).push(record);
  }

  const categories = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  const sourceCounts = new Map();
  for (const record of records) {
    const source = String(record.text || "").trim();
    if (!source) continue;
    sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
  }
  const topSources = [...sourceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  const lines = [
    "# 反馈分析报告",
    "",
    `生成时间：${new Date().toISOString()}`,
    `反馈总数：${records.length}`,
    "",
    "## 问题分类",
    ""
  ];
  for (const item of categories) {
    lines.push(`- ${item.name}：${item.count} 条`);
  }

  lines.push("", "## 高频原文", "");
  for (const [source, count] of topSources) {
    lines.push(`- ${source}（${count} 次）`);
  }

  lines.push("", "## 示例反馈", "");
  for (const [category, items] of samples.entries()) {
    lines.push(`### ${category}`, "");
    for (const item of items) {
      lines.push(`- 原文：${item.text || ""}`);
      lines.push(`  译文：${item.translation || ""}`);
      lines.push(`  反馈：${item.feedback || ""}`);
      lines.push("");
    }
  }

  const suggestions = categories.map((item) => {
    const examples = (samples.get(item.name) || []).map((record) => ({
      text: record.text || "",
      translation: record.translation || "",
      feedback: record.feedback || ""
    }));
    return {
      category: item.name,
      count: item.count,
      action:
        item.name === "安全漏拦"
          ? "把未拦截样例加入 content-policy.json 或补充 safety.js 归一化规则"
          : item.name === "梗解释不准"
            ? "把对应梗加入 llm.js 的 MEME_KNOWLEDGE，并补充具体类别与含义"
            : "把高频错误样例加入离线兜底或提示词 few-shot"
      ,
      examples
    };
  });

  await writeFile(markdownFile, lines.join("\n"), "utf8");
  await writeFile(
    suggestionsFile,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        records: records.length,
        categories,
        suggestions
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`已生成：${markdownFile}`);
  console.log(`已生成：${suggestionsFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
