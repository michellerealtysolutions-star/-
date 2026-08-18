// 内容安全过滤：在调用大模型前拦截色情、暴力和政治敏感内容。
import { readFileSync } from "node:fs";

const DEFAULT_POLICY = {
  sexual: [
    "色情", "情色", "成人影片", "av片", "黄片", "裸体", "裸聊", "性交", "做爱",
    "口交", "肛交", "自慰", "约炮", "嫖娼", "卖淫", "强奸", "性侵", "色诱",
    "porn", "pornography", "sex", "sexual", "nude", "nudity", "blowjob",
    "masturbate", "masturbation", "rape", "prostitute", "prostitution",
    "fuck", "fucking", "bitch", "slut", "cock", "pussy"
  ],
  violence: [
    "杀人", "砍人", "砍死", "炸死", "炸毁", "枪支", "持枪", "开枪", "血腥",
    "虐杀", "暴打", "恐怖袭击", "自杀", "割腕", "跳楼", "灭门", "碎尸", "投毒",
    "kill", "murder", "bomb", "shoot", "shooting", "stab", "suicide",
    "massacre", "torture", "terrorist", "terrorism"
  ],
  abuse: [
    "傻逼", "傻B", "傻b", "煞笔", "沙比", "沙雕", "你妈", "你妈的", "妈的",
    "操你", "操你妈", "草你", "草你妈", "卧槽", "我操", "我草", "滚蛋",
    "去死", "废物", "贱人", "婊子", "臭傻逼", "智障", "脑残", "白痴",
    "sb", "cnm", "tmd", "nmsl", "fuck you", "shit", "asshole", "bastard",
    "motherfucker", "dickhead"
  ],
  political: [
    "习近平", "共产党", "中共", "台独", "港独", "藏独", "疆独", "法轮功", "六四",
    "天安门事件", "反华", "辱华", "政治犯", "政变", "游行示威", "民主运动",
    "新疆独立", "西藏独立", "台湾独立", "颠覆国家", "颜色革命",
    "communist party of china", "tiananmen square", "falun gong",
    "taiwan independence", "tibet independence", "xinjiang independence"
  ]
};

function loadPolicy() {
  try {
    const raw = readFileSync(new URL("../config/content-policy.json", import.meta.url), "utf8");
    const parsed = JSON.parse(raw);
    return {
      sexual: parsed.sexual || DEFAULT_POLICY.sexual,
      violence: parsed.violence || DEFAULT_POLICY.violence,
      abuse: parsed.abuse || DEFAULT_POLICY.abuse,
      political: parsed.political || DEFAULT_POLICY.political
    };
  } catch {
    return DEFAULT_POLICY;
  }
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPattern(words) {
  const ascii = [];
  const other = [];

  for (const word of words) {
    if (/^[A-Za-z0-9\s]+$/.test(word)) ascii.push(word);
    else other.push(word);
  }

  const parts = [];
  if (other.length) parts.push(other.map(escapeRegExp).join("|"));
  if (ascii.length) parts.push(`\\b(?:${ascii.map(escapeRegExp).join("|")})\\b`);
  return new RegExp(parts.join("|"), "i");
}

// 把每个词拆成字符，允许字符之间出现标点、空格和符号，用来拦截“傻。逼”“傻 逼”这类绕过写法。
function buildObfuscatedPattern(words) {
  const parts = [];
  for (const word of words) {
    const chars = Array.from(String(word));
    if (chars.length < 2) continue;
    parts.push(chars.map(escapeRegExp).join("[\\p{P}\\p{S}\\p{Z}]*"));
  }
  return parts.length ? new RegExp(parts.join("|"), "iu") : /(?!)/;
}

const policy = loadPolicy();
const PATTERNS = {
  sexual: buildPattern(policy.sexual),
  violence: buildPattern(policy.violence),
  abuse: buildPattern(policy.abuse),
  political: buildPattern(policy.political)
};
const OBFUSCATED_PATTERNS = {
  sexual: buildObfuscatedPattern(policy.sexual),
  violence: buildObfuscatedPattern(policy.violence),
  abuse: buildObfuscatedPattern(policy.abuse),
  political: buildObfuscatedPattern(policy.political)
};

// 返回被拦截的内容类型；未命中时返回 null
export function blockReason(text) {
  const source = String(text || "").trim();
  if (!source) return null;

  if (PATTERNS.sexual.test(source)) return "sexual";
  if (PATTERNS.violence.test(source)) return "violence";
  if (PATTERNS.abuse.test(source)) return "abuse";
  if (PATTERNS.political.test(source)) return "political";

  // 第二层：识别用标点、空格、符号分隔敏感词的绕过写法
  if (OBFUSCATED_PATTERNS.sexual.test(source)) return "sexual";
  if (OBFUSCATED_PATTERNS.violence.test(source)) return "violence";
  if (OBFUSCATED_PATTERNS.abuse.test(source)) return "abuse";
  if (OBFUSCATED_PATTERNS.political.test(source)) return "political";
  return null;
}
