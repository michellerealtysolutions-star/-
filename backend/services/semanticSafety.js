// 可选的大模型语义安全第二层：仅在 SAFETY_MODEL_ENABLED=true 时启用。
const ENABLED = process.env.SAFETY_MODEL_ENABLED === "true";
const MODEL_API_KEY = process.env.MODEL_API_KEY;
const MODEL_BASE_URL = process.env.MODEL_BASE_URL || "https://api.deepseek.com";
const MODEL_NAME = process.env.SAFETY_MODEL_NAME || process.env.MODEL_NAME || "deepseek-chat";
const TIMEOUT_MS = Number(process.env.SAFETY_MODEL_TIMEOUT_MS || 8000);

// 大模型认为需要拦截时，返回原因；不启用、未配置或调用失败时返回 null。
export async function semanticBlockReason(text) {
  if (!ENABLED || !MODEL_API_KEY) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const baseUrl = MODEL_BASE_URL.replace(/\/+$/, "");
    const body = {
      model: MODEL_NAME,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "你是内容安全审核员。判断用户输入是否包含色情、暴力、政治敏感、辱骂、人身攻击、歧视、违法或明显不适合正常交流的内容。只输出 JSON：{\"blocked\":true或false,\"reason\":\"拦截原因或空字符串\"}。"
        },
        { role: "user", content: String(text || "") }
      ]
    };

    if (/^(gpt|o1|o3|openai)/i.test(MODEL_NAME)) {
      body.response_format = { type: "json_object" };
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MODEL_API_KEY}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) return null;
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;

    const cleaned = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    if (parsed.blocked !== true) return null;
    return String(parsed.reason || "语义安全审核拦截").trim() || "语义安全审核拦截";
  } catch {
    // 语义层失败时放行，避免因为审核服务抖动导致正常功能不可用。
    return null;
  } finally {
    clearTimeout(timer);
  }
}
