// 核心翻译服务：优先调用大模型，失败或未配置 Key 时回退到本地规则翻译。
import {
  buildSystemPrompt,
  buildUserPrompt,
  buildEnglishSystemPrompt,
  buildEnglishUserPrompt,
  buildAutoSystemPrompt
} from "../prompts/system.js";
import { DIALECTS } from "../prompts/dialects.js";

// 大模型相关配置（从环境变量读取）
const MODEL_API_KEY = process.env.MODEL_API_KEY;
const MODEL_BASE_URL = process.env.MODEL_BASE_URL || "https://api.deepseek.com";
const MODEL_NAME = process.env.MODEL_NAME || "deepseek-chat";
// 默认超时提高到 30 秒，避免长句、方言解释或网络抖动时误回退到离线规则
const REQUEST_TIMEOUT_MS = Number(process.env.MODEL_TIMEOUT_MS || 30000);

// 离线兜底示例：未配置 Key 时，精确命中这些示例会直接返回预设结果
const OFFLINE_EXAMPLES = [
  {
    text: "我 emo 了，想摆烂",
    direction: "young_to_elder",
    dialect: "sichuan",
    tone: "gentle",
    result: {
      translation: "最近心头有点恼火，想歇一哈",
      subtext: "不是不想努力，是最近有点累，想缓一缓。",
      tone: "gentle",
      dialect_used: "sichuan"
    }
  },
  {
    text: "你怎么还不结婚？",
    direction: "elder_to_young",
    dialect: null,
    tone: "gentle",
    result: {
      translation: "你最近还是一个人吗？我其实不是催你，是怕你以后没人照顾。",
      subtext: "背后真正担心的是你过得好不好、老了有没有依靠。",
      tone: "gentle",
      dialect_used: null
    }
  },
  {
    text: "妈，你咋又给我塞一箱鸡蛋",
    direction: "elder_to_young",
    dialect: "northeast",
    tone: "gentle",
    result: {
      translation: "妈，你又给我塞了一箱鸡蛋，我知道你是怕我在外面吃不好。",
      subtext: "不是嫌东西多，是心疼你总惦记我，也想让你放心。",
      tone: "gentle",
      dialect_used: null
    }
  },
  {
    text: "最近心头有点恼火",
    direction: "young_to_elder",
    dialect: "sichuan",
    tone: "gentle",
    result: {
      translation: "最近心头有点恼火，想歇一哈",
      subtext: "最近压力有点大，不是不想扛，是有点累了。",
      tone: "gentle",
      dialect_used: "sichuan"
    }
  },
  {
    text: "别乱花钱，省着点花",
    direction: "elder_to_young",
    dialect: null,
    tone: "gentle",
    result: {
      translation: "花钱注意一点，给自己留点余地，我知道你是怕我以后为难。",
      subtext: "不是嫌你花得多，是担心你以后需要用钱的时候紧张。",
      tone: "gentle",
      dialect_used: null
    }
  },
  {
    text: "我累了，不想说话",
    direction: "young_to_elder",
    dialect: null,
    tone: "gentle",
    result: {
      translation: "我最近有点累，想先歇一歇。",
      subtext: "不是对你有情绪，是现在没力气聊，想被理解一下。",
      tone: "gentle",
      dialect_used: null
    }
  },
  {
    text: "工作太卷了，我想离职",
    direction: "young_to_elder",
    dialect: "northeast",
    tone: "gentle",
    result: {
      translation: "现在工作竞争太激烈，我想缓一缓，换个环境。",
      subtext: "不是冲动，是已经有点扛不住，需要家里支持。",
      tone: "gentle",
      dialect_used: "northeast"
    }
  },
  {
    text: "多穿点，别冻着",
    direction: "elder_to_young",
    dialect: null,
    tone: "gentle",
    result: {
      translation: "注意保暖，别感冒了。",
      subtext: "嘴上说的是穿衣，心里担心的是你生病了没人照顾。",
      tone: "gentle",
      dialect_used: null
    }
  },
  {
    text: "谢谢你们一直操心",
    direction: "young_to_elder",
    dialect: "cantonese",
    tone: "gentle",
    result: {
      translation: "唔该，我知道你们一直好锡我。",
      subtext: "谢谢你们一直惦记我，我其实都懂。",
      tone: "gentle",
      dialect_used: "cantonese"
    }
  },
  {
    text: "你吃饭了吗",
    direction: "elder_to_young",
    dialect: null,
    tone: "gentle",
    result: {
      translation: "你吃饭了吗？要按时吃饭。",
      subtext: "不是只问吃饭，是想知道你一个人有没有照顾好自己。",
      tone: "gentle",
      dialect_used: null
    }
  }
];

// 年轻人网络用语 → 长辈更容易懂的说法（离线兜底用）
const SLANG_TO_PLAIN = [
  [/\s*emo\s*/gi, "情绪低落"],
  [/\s*e了\s*/gi, "情绪低落"],
  [/摆烂/gi, "先歇一歇"],
  [/内卷|卷/gi, "竞争太激烈"],
  [/躺平/gi, "想轻松一点"],
  [/破防/gi, "心里一下有点受不住"],
  [/无语/gi, "一时不知道说什么"],
  [/绝绝子/gi, "特别好"],
  [/yyds/gi, "特别厉害"],
  [/栓q/gi, "真是有点无奈"],
  [/芭比q/gi, "事情有点糟"],
  [/家人们/gi, "大家"],
  [/集美/gi, "姐妹"],
  [/社死/gi, "非常尴尬、没面子"],
  [/大冤种/gi, "总吃亏的人"],
  [/显眼包/gi, "爱表现、很抢眼的人"],
  [/我裂开了/gi, "我整个人都懵了"],
  [/蚌埠住了|绷不住了/gi, "实在忍不住了"],
  [/无语子/gi, "真让人无语"],
  [/\bCPU\b/gi, "在言语上反复施压"],
  [/\bPUA\b/gi, "在言语上打压或操控"],
  [/city不city/gi, "有没有那个感觉"],
  [/电子榨菜/gi, "吃饭时看的下饭内容"],
  [/搭子/gi, "一起做某件事的同伴"],
  [/松弛感/gi, "不紧绷、很放松"],
  [/脆皮年轻人/gi, "容易出小状况的年轻人"],
  [/中国人能飞/gi, "中国人特别厉害，好像会飞一样"]
];

// 长辈常用句式 → 更温和、更好理解的表达（离线兜底用）
const ELDER_PHRASES = [
  [/你咋|你怎么/gi, "你最近"],
  [/还不结婚|不找对象|不成家/gi, "还是一个人"],
  [/乱花钱|省着点花/gi, "花钱注意一点"],
  [/别熬夜|注意身体/gi, "照顾好身体"],
  [/为你好/gi, "是为你好"],
  [/多穿点|别冻着/gi, "注意保暖"]
];

// 是否配置了大模型 Key
export function isModelConfigured() {
  return Boolean(MODEL_API_KEY);
}

// 统一入口：按 direction 分派到自动模式、英语代际或中文代际
export async function translate({ text, direction, dialect, tone }) {
  if (direction === "auto") {
    return translateAuto({ text, dialect, tone });
  }

  if (["en_young_to_elder", "en_elder_to_young"].includes(direction)) {
    return translateEnglish({ text, direction });
  }

  if (!MODEL_API_KEY) {
    return localTranslate({ text, direction, dialect, tone });
  }

  const system = buildSystemPrompt(dialect);
  const user = buildUserPrompt({ text, direction, dialect, tone });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const content = await callModel(system, user);
      const parsed = parseModelOutput(content);
      if (parsed) {
        return normalizeResult(parsed, direction, dialect, tone, text);
      }
    } catch (error) {
      console.warn(`[llm] attempt ${attempt + 1} failed:`, error.message);
    }
  }

  return localTranslate({ text, direction, dialect, tone });
}

// 调用 OpenAI 兼容的聊天补全接口，带超时控制
async function callModel(system, user) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const baseUrl = MODEL_BASE_URL.replace(/\/+$/, "");
  const url = `${baseUrl}/chat/completions`;

  try {
    const body = {
      model: MODEL_NAME,
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    };

    if (/^(gpt|o1|o3|openai)/i.test(MODEL_NAME)) {
      body.response_format = { type: "json_object" };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MODEL_API_KEY}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Model API ${response.status}: ${detail.slice(0, 200)}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Model API returned empty content");
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
}

// 解析模型返回的 JSON，容忍被 Markdown 代码块包裹的情况
function parseModelOutput(content) {
  if (!content) return null;

  const cleaned = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

// 归一化模型输出为统一结构，防止字段缺失
function normalizeResult(raw, direction, dialect, tone, source = null) {
  const translation = String(raw?.translation || "").trim();
  const subtext = String(raw?.subtext || "").trim();
  if (!translation || !subtext) return null;

  return {
    translation,
    subtext,
    meme: resolveMeme(normalizeMeme(raw), source),
    tone: raw?.tone === "direct" ? "direct" : "gentle",
    dialect_used: DIALECTS[raw?.dialect_used] ? raw.dialect_used : dialect || null
  };
}

// 中文代际翻译的本地规则兜底
function localTranslate({ text, direction, dialect, tone }) {
  const source = String(text || "").trim();
  const targetTone = tone === "direct" ? "direct" : "gentle";

  const example = OFFLINE_EXAMPLES.find((item) => {
    return (
      item.text === source &&
      item.direction === direction &&
      (item.dialect || null) === (dialect || null) &&
      (item.tone || "gentle") === targetTone
    );
  });

  if (example) {
    return { ...example.result, meme: detectMemeInfo(source) };
  }

  if (direction === "elder_to_young") {
    let plain = replaceAll(source, ELDER_PHRASES);
    plain = trimEndingPunctuation(plain);
    const translation = targetTone === "direct"
      ? `${plain}。`
      : `${plain}，我明白你是为我好。`;
    return {
      translation,
      subtext: inferElderSubtext(source),
      meme: detectMemeInfo(source),
      tone: targetTone,
      dialect_used: null
    };
  }

  let translation = replaceAll(source, SLANG_TO_PLAIN);
  translation = collapseSpaces(translation);
  if (dialect && DIALECTS[dialect]) {
    translation = dialectize(translation, dialect);
  }

  if (targetTone === "gentle") {
    translation = softenYoungText(translation);
  }

  return {
    translation,
    subtext: inferYoungSubtext(source),
    meme: detectMemeInfo(source),
    tone: targetTone,
    dialect_used: dialect && DIALECTS[dialect] ? dialect : null
  };
}

// 按 [正则, 替换词] 数组依次替换
function replaceAll(text, pairs) {
  return pairs.reduce((result, [pattern, replacement]) => {
    return result.replace(pattern, replacement);
  }, text);
}

// 把文本中的普通话词汇替换成指定方言词汇
function dialectize(text, dialect) {
  const words = DIALECTS[dialect].words;
  return words.reduce((result, [standard, local]) => {
    return result.split(standard).join(local);
  }, text);
}

// 温和语气：给译文补一个缓冲语气
function softenYoungText(text) {
  const trimmed = trimEndingPunctuation(text);
  if (/缓|歇|休息|轻松|被理解/.test(trimmed)) {
    return `${trimmed}。`;
  }
  return `${trimmed}，想先缓一缓。`;
}

function trimEndingPunctuation(text) {
  return text.replace(/[，。！？!?\s]+$/, "");
}

function collapseSpaces(text) {
  return text.replace(/[ \t]+/g, " ").replace(/\s+([，。！？!?])/g, "$1").trim();
}

function inferYoungSubtext(text) {
  if (/emo|e了|摆烂|躺平|累|焦虑|压力|不想/.test(text)) {
    return "不是真的想放弃，是最近压力有点大，想被理解一下。";
  }
  if (/工作|加班|老板|辞职|赚钱|失业/.test(text)) {
    return "其实想让你知道我现在不容易，也希望你别太担心。";
  }
  if (/对象|结婚|恋爱|单身/.test(text)) {
    return "不是排斥这件事，是想按自己的节奏来，也需要一点空间。";
  }
  return "这句话背后其实是想被听见、被理解，而不是被评判。";
}

function inferElderSubtext(text) {
  if (/结婚|对象|成家|单身/.test(text)) {
    return "其实更担心你过得好不好、将来有没有人照顾，不是真的要催你。";
  }
  if (/工作|赚钱|省着|花钱|工资|事业/.test(text)) {
    return "担心你压力大、生活不稳定，想确认家里能不能帮上忙。";
  }
  if (/身体|累|熬夜|生病|吃药|多穿|别冻/.test(text)) {
    return "是怕你累坏身体，希望你把自己照顾好。";
  }
  if (/吃饭|饿|营养|多吃|瘦/.test(text)) {
    return "嘴上说的是吃饭，心里惦记的是你有没有好好生活。";
  }
  return "想表达关心，但可能没把话说透，别只从字面理解。";
}

// 英文年轻俚语 → 清晰表达（离线兜底用）
const SLANG = [
  { pattern: /\bno cap\b/gi, replacement: "honestly", key: "no cap", meaning: "说真的、不骗你" },
  { pattern: /\bcap\b/gi, replacement: "a lie", key: "cap", meaning: "说谎" },
  { pattern: /\bmid\b/gi, replacement: "mediocre", key: "mid", meaning: "平庸、一般" },
  { pattern: /\bslay\b/gi, replacement: "excellent", key: "slay", meaning: "太棒了、绝了" },
  { pattern: /\bbet\b/gi, replacement: "sure", key: "bet", meaning: "好的、没问题" },
  { pattern: /\bsus\b/gi, replacement: "suspicious", key: "sus", meaning: "可疑的" },
  { pattern: /\bgoat\b/gi, replacement: "the greatest of all time", key: "GOAT", meaning: "史上最强" },
  { pattern: /\bfomo\b/gi, replacement: "the fear of missing out", key: "FOMO", meaning: "害怕错过" },
  { pattern: /\blowkey\b/gi, replacement: "slightly", key: "lowkey", meaning: "低调地、有点" },
  { pattern: /\bhighkey\b/gi, replacement: "very", key: "highkey", meaning: "很明显、非常" },
  { pattern: /\bdope\b/gi, replacement: "excellent", key: "dope", meaning: "很棒" },
  { pattern: /\blit\b/gi, replacement: "exciting", key: "lit", meaning: "很精彩" },
  { pattern: /\bsalty\b/gi, replacement: "upset", key: "salty", meaning: "不爽、生气" },
  { pattern: /\brizz\b/gi, replacement: "charm", key: "rizz", meaning: "魅力、吸引力" },
  { pattern: /\bdelulu\b/gi, replacement: "delusional", key: "delulu", meaning: "不切实际、上头" },
  { pattern: /\bsigma\b/gi, replacement: "independent and self-reliant", key: "sigma", meaning: "网络梗：独立、不随大流" },
  { pattern: /\bbased\b/gi, replacement: "authentic and unapologetic", key: "based", meaning: "很真实、很敢说" },
  { pattern: /\byeet\b/gi, replacement: "throw or discard", key: "yeet", meaning: "用力扔、丢掉" },
  { pattern: /\btouch grass\b/gi, replacement: "spend time offline", key: "touch grass", meaning: "少上网、多出门" },
  { pattern: /\bmain character\b/gi, replacement: "self-centered", key: "main character", meaning: "网络梗：以自我为中心" }
];

// 年轻口语/弱读 → 清晰正式英语（离线兜底用）
const CASUAL_TO_FORMAL_PAIRS = [
  [/\bgonna\b/gi, "going to"],
  [/\bwanna\b/gi, "want to"],
  [/\bgotta\b/gi, "have to"],
  [/\bgimme\b/gi, "give me"],
  [/\blemme\b/gi, "let me"],
  [/\bkinda\b/gi, "kind of"],
  [/\bsorta\b/gi, "sort of"],
  [/\bdunno\b/gi, "do not know"],
  [/\bI'm\b/gi, "I am"],
  [/\byou're\b/gi, "you are"],
  [/\bhe's\b/gi, "he is"],
  [/\bshe's\b/gi, "she is"],
  [/\bit's\b/gi, "it is"],
  [/\bwe're\b/gi, "we are"],
  [/\bthey're\b/gi, "they are"],
  [/\bI've\b/gi, "I have"],
  [/\bdon't\b/gi, "do not"],
  [/\bdoesn't\b/gi, "does not"],
  [/\bdidn't\b/gi, "did not"],
  [/\bcan't\b/gi, "cannot"],
  [/\bwon't\b/gi, "will not"],
  [/\bisn't\b/gi, "is not"],
  [/\baren't\b/gi, "are not"],
  [/\bwasn't\b/gi, "was not"],
  [/\bweren't\b/gi, "were not"]
];

// 正式英语 → 口语化英语的缩写替换（离线兜底用）
const CASUAL_PAIRS = [
  [/\bI am\b/gi, "I'm"],
  [/\byou are\b/gi, "you're"],
  [/\bhe is\b/gi, "he's"],
  [/\bshe is\b/gi, "she's"],
  [/\bit is\b/gi, "it's"],
  [/\bwe are\b/gi, "we're"],
  [/\bthey are\b/gi, "they're"],
  [/\bI would\b/gi, "I'd"],
  [/\bI will\b/gi, "I'll"],
  [/\bdo not\b/gi, "don't"],
  [/\bdoes not\b/gi, "doesn't"],
  [/\bcannot\b/gi, "can't"],
  [/\bis not\b/gi, "isn't"],
  [/\bare not\b/gi, "aren't"],
  [/\bhave got to\b/gi, "gotta"],
  [/\bgoing to\b/gi, "gonna"],
  [/\bwant to\b/gi, "wanna"],
  [/\bhave to\b/gi, "gotta"],
  [/\bkind of\b/gi, "kinda"],
  [/\blet me\b/gi, "lemme"],
  [/\bgive me\b/gi, "gimme"],
  [/\bbecause\b/gi, "'cause"]
];

// 英语代际翻译：大模型优先，失败回退规则
async function translateEnglish({ text, direction }) {
  if (MODEL_API_KEY) {
    const system = buildEnglishSystemPrompt(direction);
    const user = buildEnglishUserPrompt(String(text).trim());

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const content = await callModel(system, user);
        const parsed = parseModelOutput(content);
        if (parsed?.translation) {
          return {
            translation: String(parsed.translation).trim(),
            subtext: String(parsed.subtext || "").trim(),
            meme: resolveMeme(normalizeMeme(parsed), String(text).trim()),
            tone: "gentle",
            dialect_used: null
          };
        }
      } catch (error) {
        console.warn(`[llm] english attempt ${attempt + 1} failed:`, error.message);
      }
    }
  }

  return localEnglish({ text, direction });
}

// 英语代际翻译的本地规则兜底
function localEnglish({ text, direction }) {
  const source = String(text || "").trim();

  if (direction === "en_young_to_elder") {
    const result = youngToElder(source);
    return {
      translation: result.translation,
      subtext: result.notes,
      meme: result.meme,
      tone: "gentle",
      dialect_used: null
    };
  }

  if (direction === "en_elder_to_young") {
    return {
      translation: toCasualEnglish(source),
      subtext: "已改为更自然的年轻英语说法。",
      meme: detectMemeInfo(source),
      tone: "gentle",
      dialect_used: null
    };
  }

  return {
    translation: "（离线模式暂不支持，请配置大模型 API Key）",
    subtext: "",
    meme: null,
    tone: "gentle",
    dialect_used: null
  };
}

// 年轻英语 → 长辈英语：替换俚语并收集含义解释
function youngToElder(text) {
  let translation = text;
  const meanings = [];

  // 先展开弱读和缩写，避免把 too informal 的说法留到译文里
  translation = CASUAL_TO_FORMAL_PAIRS.reduce((result, [pattern, replacement]) => {
    return result.replace(pattern, replacement);
  }, translation);

  for (const item of SLANG) {
    // 用翻译中的文本判断，避免「no cap」先被替换后，「cap」又被重复匹配
    if (item.pattern.test(translation)) {
      translation = translation.replace(item.pattern, item.replacement);
      meanings.push(`${item.key}（${item.meaning}）`);
    }
  }

  const notes = meanings.length
    ? `俚语解释：${meanings.join("；")}`
    : "未识别到明显俚语，已尽量转为清晰表达。";
  return { translation, notes, meme: detectMemeInfo(text) };
}

// 长辈英语 → 年轻英语：套用缩写规则
function toCasualEnglish(text) {
  return CASUAL_PAIRS.reduce((result, [pattern, replacement]) => {
    return result.replace(pattern, replacement);
  }, text);
}

// 自动模式：由模型判断语言、年轻/长辈方向并完成翻译
async function translateAuto({ text, dialect, tone }) {
  const source = String(text || "").trim();
  const isZh = /[\u4e00-\u9fff]/.test(source);
  // 单独的梗不需要代际翻译，直接原样返回，避免把一个词硬翻成奇怪句子
  if (isStandaloneMeme(source)) {
    const meme = getMemeInfo(source);
    return {
      translation: source,
      subtext: "这是一句网络梗，不需要代际翻译。",
      meme,
      tone: tone === "direct" ? "direct" : "gentle",
      dialect_used: null,
      detected_direction: null,
      needs_translation: false
    };
  }
  // 先做一层本地强规则兜底，避免模型把明显的梗或长辈话误判为“无需翻译”
  const heuristic = guessDirection(source, isZh);

  if (MODEL_API_KEY) {
    const system = buildAutoSystemPrompt(isZh, tone);
    const heuristicLabel =
      heuristic === "young_to_elder"
        ? "年轻 → 长辈"
        : heuristic === "elder_to_young"
          ? "长辈 → 年轻"
          : "";
    const user = `语气要求：${tone === "direct" ? "更直接" : "更温和"}
${heuristicLabel ? `重要：这句话明显属于“${heuristicLabel}”表达，请直接按这个方向翻译，不要返回 none。` : ""}
请判断并翻译：${source}`;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const content = await callModel(system, user);
        const parsed = parseModelOutput(content);
        if (parsed?.translation) {
          const detected =
            parsed.direction === "elder_to_young"
              ? "elder_to_young"
              : parsed.direction === "young_to_elder"
                ? "young_to_elder"
                : null;
          const needsTranslation = parsed.needs_translation !== false && detected !== null;

          if (!needsTranslation) {
            // 模型认为无需翻译，但本地规则明显识别为年轻/长辈时，改走显式方向翻译
            if (heuristic) {
              break;
            }
            return {
              translation: source,
              subtext: String(parsed.subtext || "这句话已经很自然，无需代际翻译。").trim(),
              meme: resolveMeme(normalizeMeme(parsed), source),
              tone: tone === "direct" ? "direct" : "gentle",
              dialect_used: null,
              detected_direction: null,
              needs_translation: false
            };
          }

          return {
            translation: String(parsed.translation).trim(),
            subtext: String(parsed.subtext || "").trim(),
            meme: resolveMeme(normalizeMeme(parsed), source),
            tone: tone === "direct" ? "direct" : "gentle",
            dialect_used: parsed.dialect_used || (isZh ? dialect || null : null),
            detected_direction: detected,
            needs_translation: true
          };
        }
      } catch (error) {
        console.warn(`[llm] auto attempt ${attempt + 1} failed:`, error.message);
      }
    }
  }

  const detected = heuristic;
  if (!detected) {
    return {
      translation: source,
      subtext: "这句话已经很自然，无需代际翻译。",
      meme: detectMemeInfo(source),
      tone: tone === "direct" ? "direct" : "gentle",
      dialect_used: null,
      detected_direction: null,
      needs_translation: false
    };
  }

  // 明显命中本地规则时，用显式方向再翻译一次，保证梗和长辈话不会被漏掉
  if (MODEL_API_KEY) {
    const explicitDirection = isZh
      ? detected
      : detected === "young_to_elder"
        ? "en_young_to_elder"
        : "en_elder_to_young";
    try {
      const explicitResult = await translate({
        text: source,
        direction: explicitDirection,
        dialect,
        tone
      });
      return {
        ...explicitResult,
        meme: resolveMeme(explicitResult.meme, source),
        detected_direction: detected,
        needs_translation: true
      };
    } catch (error) {
      console.warn("[llm] explicit direction fallback failed:", error.message);
    }
  }

  const result = isZh
    ? localTranslate({ text: source, direction: detected, dialect, tone })
    : localEnglish({
        text: source,
        direction: detected === "young_to_elder" ? "en_young_to_elder" : "en_elder_to_young"
      });

  return { ...result, detected_direction: detected, needs_translation: true };
}

// 常见梗知识库：用于离线兜底，也用于修正模型可能给出的模糊类别。
const MEME_KNOWLEDGE = [
  { key: "中国人能飞", pattern: /中国人能飞/, category: "出圈/事件梗", meaning: "源自网络热梗，常用来表达中国人很厉害、很有冲劲，也可能和舞台吊威亚、说唱热歌等出圈场景有关。" },
  { key: "yyds", pattern: /\byyds\b/i, category: "缩写梗", meaning: "“永远的神”的拼音首字母缩写，用来夸某个人或事物特别厉害、无可替代。" },
  { key: "yygq", pattern: /\byygq\b/i, category: "缩写梗", meaning: "“阴阳怪气”的拼音首字母缩写，指说话拐弯抹角、带讽刺。" },
  { key: "emo", pattern: /\bemo\b|e了/i, category: "情绪/缩写梗", meaning: "来自英文 emotional 的简称，表示情绪低落、有点难过或丧。" },
  { key: "摆烂", pattern: /摆烂/, category: "网络流行语", meaning: "不再努力、破罐破摔，先放弃或歇一歇。" },
  { key: "内卷", pattern: /内卷|太卷|好卷|卷不动|卷起来了/, category: "网络流行语", meaning: "过度竞争，大家互相较劲，越努力越累，但收益不一定增加。" },
  { key: "躺平", pattern: /躺平/, category: "网络流行语", meaning: "不再拼命内卷，选择低欲望、轻松一点的生活方式。" },
  { key: "破防", pattern: /破防/, category: "情绪梗", meaning: "心理防线被戳破，一下忍不住难过、感动或情绪激动。" },
  { key: "社死", pattern: /社死/, category: "场景梗", meaning: "“社会性死亡”的简称，指在公开场合尴尬到想消失。" },
  { key: "我真的会谢", pattern: /我真的会谢|会谢/, category: "反讽梗", meaning: "表面说感谢，实际表达无语、无奈或不满，语气带反讽。" },
  { key: "栓q", pattern: /栓q/i, category: "谐音梗", meaning: "“Thank you”的谐音，多用于表达无奈、无语或反讽。" },
  { key: "芭比q", pattern: /芭比q/i, category: "谐音梗", meaning: "“Barbecue”的谐音，常表示事情糟了、完蛋了。" },
  { key: "家人们", pattern: /家人们/, category: "称呼梗", meaning: "直播或博主对观众的亲切称呼，相当于“大家”。" },
  { key: "集美", pattern: /集美/, category: "谐音梗", meaning: "“姐妹”的谐音，用来称呼女性朋友。" },
  { key: "绝绝子", pattern: /绝绝子/, category: "网络流行语", meaning: "特别好或特别绝，也可用于夸张表达。" },
  { key: "大冤种", pattern: /大冤种/, category: "网络流行语", meaning: "总是吃亏、被坑的人。" },
  { key: "显眼包", pattern: /显眼包/, category: "网络流行语", meaning: "爱表现、很抢眼的人，常带调侃语气。" },
  { key: "我裂开了", pattern: /我裂开了|裂开/, category: "情绪梗", meaning: "整个人都懵了、崩溃了，用来表达强烈的无奈或震惊。" },
  { key: "蚌埠住了", pattern: /蚌埠住了|绷不住了/, category: "谐音梗", meaning: "“绷不住了”的谐音，表示实在忍不住笑或情绪。" },
  { key: "无语子", pattern: /无语子/, category: "网络流行语", meaning: "“无语”的可爱化说法，表示真让人无语。" },
  { key: "CPU", pattern: /\bCPU\b/i, category: "字母梗", meaning: "在感情或职场语境中常指反复施压、控制或洗脑，和计算机 CPU 无关。" },
  { key: "PUA", pattern: /\bPUA\b/i, category: "字母梗", meaning: "通过打压、操控等方式让对方自我怀疑、服从自己。" },
  { key: "city不city", pattern: /city不city/i, category: "中英混搭梗", meaning: "有没有那种感觉、像不像那回事，常用于询问某个事物是否时尚、地道或有趣。" },
  { key: "电子榨菜", pattern: /电子榨菜/, category: "比喻梗", meaning: "吃饭时看的视频或内容，像榨菜一样下饭。" },
  { key: "搭子", pattern: /搭子/, category: "网络流行语", meaning: "为了做某件事临时组成的同伴，例如饭搭子、旅游搭子。" },
  { key: "松弛感", pattern: /松弛感/, category: "网络流行语", meaning: "不紧绷、很放松、有从容的状态。" },
  { key: "脆皮年轻人", pattern: /脆皮年轻人/, category: "比喻梗", meaning: "指容易出小状况、有点脆弱的年轻人，常带自嘲。" },
  { key: "尊嘟假嘟", pattern: /尊嘟假嘟/i, category: "谐音梗", meaning: "“真的假的”的可爱谐音，用来表达惊讶或确认。" },
  { key: "遥遥领先", pattern: /遥遥领先/, category: "出圈梗", meaning: "常用来形容某事物明显领先，带调侃或骄傲。" },
  { key: "泼天的富贵", pattern: /泼天的富贵/, category: "网络流行语", meaning: "形容突然到来的巨大好运或流量。" },
  { key: "纯爱战士", pattern: /纯爱战士/, category: "圈层梗", meaning: "坚持纯粹爱情、反感背叛或利益算计的人。" },
  { key: "重生之", pattern: /重生之/, category: "网文梗", meaning: "网文常见开头，表示重新开始、换个身份或情景。" },
  { key: "no cap", pattern: /\bno cap\b/i, category: "英语俚语梗", meaning: "说真的、不骗你，强调自己讲的是实话。" },
  { key: "mid", pattern: /\bmid\b/i, category: "英语俚语梗", meaning: "平庸、一般，表示某事物不够好。" },
  { key: "rizz", pattern: /\brizz\b/i, category: "英语俚语梗", meaning: "魅力、吸引力，尤其指搭讪或吸引人的能力。" },
  { key: "delulu", pattern: /\bdelulu\b/i, category: "英语俚语梗", meaning: "delusional 的可爱说法，表示不切实际、有点上头。" },
  { key: "sus", pattern: /\bsus\b/i, category: "英语缩写梗", meaning: "suspicious 的缩写，表示可疑、不对劲。" },
  { key: "GOAT", pattern: /\bgoat\b/i, category: "英语缩写梗", meaning: "Greatest Of All Time 的缩写，表示史上最强。" },
  { key: "FOMO", pattern: /\bfomo\b/i, category: "英语缩写梗", meaning: "Fear Of Missing Out，害怕错过有趣的事情或机会。" },
  { key: "slay", pattern: /\bslay\b/i, category: "英语俚语梗", meaning: "太棒了、绝了，用来夸某人表现得很好。" },
  { key: "bet", pattern: /\bbet\b/i, category: "英语俚语梗", meaning: "好的、没问题，也可表示“我信你”。" },
  { key: "lowkey", pattern: /\blowkey\b/i, category: "英语俚语梗", meaning: "低调地、有点，用来弱化语气。" },
  { key: "highkey", pattern: /\bhighkey\b/i, category: "英语俚语梗", meaning: "很明显、非常，用来强调语气。" },
  { key: "dope", pattern: /\bdope\b/i, category: "英语俚语梗", meaning: "很棒、很酷。" },
  { key: "lit", pattern: /\blit\b/i, category: "英语俚语梗", meaning: "很精彩、很热闹，也可表示兴奋。" },
  { key: "salty", pattern: /\bsalty\b/i, category: "英语俚语梗", meaning: "不爽、生气，带点小心眼。" },
  { key: "sigma", pattern: /\bsigma\b/i, category: "英语网络梗", meaning: "网络语境中指独立、不随大流的人。" },
  { key: "based", pattern: /\bbased\b/i, category: "英语网络梗", meaning: "很真实、很敢说，通常表示赞同某种敢作敢为的态度。" },
  { key: "yeet", pattern: /\byeet\b/i, category: "英语网络梗", meaning: "用力扔、丢掉，也可作感叹词表达兴奋。" },
  { key: "touch grass", pattern: /\btouch grass\b/i, category: "英语网络梗", meaning: "少上网、多出门接触现实生活。" },
  { key: "main character", pattern: /\bmain character\b/i, category: "英语网络梗", meaning: "网络梗：以自我为中心，好像自己是故事主角。" }
];

// 归一化模型返回的 meme 字段，兼容字符串和对象两种形式。
function normalizeMeme(raw) {
  const value = raw?.meme;
  if (!value) return null;
  if (typeof value === "string") {
    const text = value.trim();
    return text ? { category: "网络梗", meaning: text } : null;
  }
  const category = String(value.category || value.type || value.kind || "网络梗").trim();
  const meaning = String(value.meaning || value.explanation || value.detail || "").trim();
  if (!meaning) return null;
  return { category, meaning };
}

// 统一去掉标点、空格和大小写，便于做精确匹配。
function normalizeMemeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[\s，。！？!?,.、'"“”‘’（）()]/g, "");
}

// 收集句子中命中的所有已知梗；精确命中单独梗时只返回那一条。
function collectMemeInfos(text) {
  const source = String(text || "");
  const normalized = normalizeMemeText(source);
  const exact = MEME_KNOWLEDGE.find((item) => normalizeMemeText(item.key) === normalized);
  if (exact) return [exact];
  return MEME_KNOWLEDGE.filter((item) => item.pattern.test(source));
}

// 优先精确匹配梗名；否则在句子中查找已知梗。
function getMemeInfo(text) {
  const infos = collectMemeInfos(text);
  if (!infos.length) return null;
  if (infos.length === 1) {
    return { category: infos[0].category, meaning: infos[0].meaning };
  }
  const categories = [...new Set(infos.map((item) => item.category))];
  const meaning = infos.map((item) => `${item.key}：${item.meaning}`).join("；");
  return { category: categories.join(" / "), meaning };
}

// 句子级梗识别：本地规则兜底用，模型已经给出时优先使用模型结果。
function detectMemeInfo(text) {
  return getMemeInfo(text);
}

// 本地知识库能识别时，用更准确的类别和含义修正模型结果。
function resolveMeme(modelMeme, text) {
  return detectMemeInfo(text) || modelMeme || null;
}

// 常见单独出现的网络梗：仅当输入几乎就是梗本身时，才跳过代际翻译。
function isStandaloneMeme(text) {
  const normalized = normalizeMemeText(text);
  return MEME_KNOWLEDGE.some((item) => normalizeMemeText(item.key) === normalized);
}

// 离线自动判断方向的启发式规则（无 Key 时使用）
function guessDirection(text, isZh) {
  if (isZh) {
    const young = /emo|e了|摆烂|躺平|内卷|\b卷\b|破防|yyds|绝绝子|集美|家人们|无语|栓q|芭比q|焦虑|不想上班|想离职|想辞职|搞钱|摸鱼|社恐|精神内耗|我累了|社死|大冤种|显眼包|我裂开了|蚌埠住了|绷不住了|无语子|city不city|电子榨菜|搭子|松弛感|脆皮年轻人|CPU|PUA|中国人能飞/.test(text);
    const elder = /还不结婚|不找对象|不成家|别乱花钱|省着点花|多穿点|为你好|吃饭了吗|早睡|注意身体|别熬夜|要懂事|多喝热水|听我一句|我像你这么大的时候|吃亏|老了以后|成家立业/.test(text);
    if (young && !elder) return "young_to_elder";
    if (elder && !young) return "elder_to_young";
    return null;
  }

  const young = /\b(no cap|mid|sus|slay|bet|fomo|lowkey|highkey|dope|lit|salty|gonna|wanna|gotta|bruh|vibe check|ghosted|flex|rizz|delulu|sigma|based|yeet|touch grass|main character)\b/i.test(text);
  const elder = /\b(I am going to|I would like to|I will be attending|please|kindly|in my day|you should|it is important that|I hope this message finds you well|respectfully)\b/i.test(text);
  if (young && !elder) return "young_to_elder";
  if (elder && !young) return "elder_to_young";
  return null;
}
