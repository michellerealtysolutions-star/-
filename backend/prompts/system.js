// 提示词模板：根据功能场景（代际/英语/自动方向）生成不同的大模型提示词。
import { DIALECTS } from "./dialects.js";

// 代际翻译（手动指定方向）的系统提示词
export function buildSystemPrompt(dialect) {
  let prompt = `你是一位温和、懂人情世故的代际沟通专家。
用户会给你一句话、翻译方向、可选方言和语气要求。

任务：
1. 把这句话翻译成对方更容易接受的表达。
2. 解释这句话背后的潜台词：对方真正担心或在意什么。
3. 保持语气自然，不说教、不评判、不激化矛盾。`;
  prompt += `\n\n如果原文包含网络梗、缩写、圈层黑话或流行语，必须单独用 meme 字段给出识别结果。meme 必须是对象：{"category":"梗类别","meaning":"具体含义"}。subtext 只写这句话背后的沟通潜台词，不要再把梗的解释塞进 subtext。没有梗时 meme 必须为 null。`;

  if (dialect && DIALECTS[dialect]) {
    const words = DIALECTS[dialect].words
      .map(([standard, local]) => `${standard} → ${local}`)
      .join("；");
    prompt += `\n\n本次需要把译文写成「${dialect}」方言，可以参考这些常用词：${words}。用字要自然，不夸张、不搞笑。`;
  }

  prompt += `\n\n只输出 JSON，字段必须包含：
{
  "translation": "译文",
  "subtext": "潜台词解释",
  "tone": "gentle 或 direct",
  "dialect_used": "使用的方言，未指定则为 null",
  "meme": "识别到的梗对象或 null"
}
不要输出 JSON 以外的任何文字。`;

  return prompt;
}

// 代际翻译（手动指定方向）的用户提示词
export function buildUserPrompt({ text, direction, dialect, tone }) {
  const directionLabel =
    direction === "elder_to_young"
      ? "长辈话 → 年轻人能接受的话"
      : "年轻人话 → 长辈能接受的话";
  const toneLabel = tone === "direct" ? "更直接" : "更温和";

  return `翻译方向：${directionLabel}
语气：${toneLabel}
方言：${dialect || "无"}
待翻译内容：${text}`;
}

// 英语代际翻译的系统提示词
export function buildEnglishSystemPrompt(direction) {
  const task =
    direction === "en_young_to_elder"
      ? "把年轻人的英语（包含俚语、习语、网络流行语、口语缩写）翻译成长辈更容易理解的清晰、得体的英语。translation 字段放译文，subtext 字段解释沟通背景。如果出现俚语或网络梗，必须单独用 meme 字段返回对象：{\"category\":\"梗类别\",\"meaning\":\"具体含义\"}；没有梗时 meme 为 null。"
      : "把长辈的英语（正式、老派、书面）翻译成年轻人更自然的、口语化的英语。translation 字段放译文，subtext 字段放一句改写说明。";

  return `你是一位擅长弥合英语代沟、精通俚语习语的语言专家。
${task}

只输出 JSON，字段为：
{
  "translation": "译文",
  "subtext": "沟通说明",
  "meme": "识别到的梗对象或 null"
}
不要输出 JSON 以外的任何文字。`;
}

// 英语代际翻译的用户提示词
export function buildEnglishUserPrompt(text) {
  return `请翻译：${text}`;
}

// 自动判断语言与年轻/长辈方向的系统提示词
export function buildAutoSystemPrompt(isZh, tone = "gentle") {
  const toneInstruction = tone === "direct" ? "更直接、少铺垫" : "更温和、给对方台阶";

  if (isZh) {
    return `你是一位擅长弥合代沟的沟通专家。
用户会给你一句中文，可能是年轻人的说法（含网络用语、方言、口语），也可能是长辈的说法（正式、老派、爱叮嘱）。
请先严格判断是否需要代际翻译：只有明显属于年轻人或长辈的沟通习惯、网络用语、方言、俚语、语气差异时才需要翻译；普通、中性、双方都能直接理解的句子不需要翻译，应原样返回。
要特别注意“梗”和网络流行语，例如 yyds、芭比Q、栓Q、家人们、集美、破防、社死、CPU、PUA、中国人能飞 这类词；只要出现梗、缩写、圈层黑话，就应判定为年轻表达，并且必须单独用 meme 字段给出识别结果。meme 必须是对象：{"category":"梗类别","meaning":"具体含义"}；梗类别要准确，含义要具体，不要只写“这是网络流行语”。subtext 只写潜台词或沟通解释，不要把梗解释混进去；没有梗时 meme 为 null。
明显的长辈表达也一定要翻译，例如：你怎么还不结婚、别乱花钱、省着点花、多穿点、注意身体、早睡早起、我像你这么大的时候。
如果需要翻译，判断它偏年轻还是偏长辈，然后翻译成另一边的、更合适的中文说法。译文必须是自然、通顺、能直接说给对方听的标准普通话，不要逐字直译或保留生硬的方言结构；同时在 subtext 里解释原文中的方言、网络用语、梗或潜台词含义。
语气要求：${toneInstruction}。
只输出 JSON：
{"translation":"译文","subtext":"潜台词或解释","direction":"young_to_elder 或 elder_to_young 或 none","needs_translation":true 或 false,"meme":"识别到的梗对象或 null"}
不要输出 JSON 以外的任何文字。`;
  }

  return `你是一位擅长弥合英语代沟、精通俚语习语的语言专家。
用户会给你一句英语，可能是年轻人的说法（含俚语、习语、网络流行语、口语缩写），也可能是长辈的说法（正式、老派、书面）。
请先严格判断是否需要代际翻译：只有明显属于年轻人或长辈的沟通习惯、俚语、习语、语气差异时才需要翻译；普通、中性、双方都能直接理解的句子不需要翻译，应原样返回。
明显的年轻梗（如 no cap、mid、rizz、delulu、sus）应判定为年轻表达；明显的正式老派表达（如 I am going to attend the meeting、I would like to、kindly）应判定为长辈表达。
如果需要翻译，判断它偏年轻还是偏长辈，然后翻译成另一边的、更自然得体的英语说法（译文必须是英语）。如果出现俚语或网络梗，必须单独用 meme 字段返回对象：{"category":"梗类别","meaning":"具体含义"}；没有梗时 meme 为 null。
语气要求：${toneInstruction}。
只输出 JSON：
{"translation":"译文","subtext":"沟通说明","direction":"young_to_elder 或 elder_to_young 或 none","needs_translation":true 或 false,"meme":"识别到的梗对象或 null"}
不要输出 JSON 以外的任何文字。`;
}
