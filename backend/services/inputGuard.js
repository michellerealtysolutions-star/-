// 输入合法性检查：只允许中文或英文，并过滤明显无逻辑的乱码。
const DISALLOWED_SCRIPT =
  /[^\p{Script=Han}\p{Script=Latin}\p{Number}\p{Punctuation}\p{Symbol}\p{Separator}\p{Mark}]/u;

// 拉丁字母语言中的非英语常见重音字符，用于拦截法语、西语、德语等非英语输入
const NON_ENGLISH_LATIN = /[À-ÿ]/;
const UNSAFE_PATTERNS = [
  /<script|<\/script|javascript:|onerror\s*=|onclick\s*=|onload\s*=/i,
  /(\bUNION\s+SELECT\b|\bDROP\s+TABLE\b|\bOR\s+1\s*=\s*1\b|\b1\s*=\s*1\b|(['\w]+)\s*=\s*\1)/i
];

// 返回拒绝原因；输入可接受时返回 null
export function inputGuardReason(text) {
  const source = String(text || "").trim();
  if (!source) return "EMPTY";

  const hasHan = /\p{Script=Han}/u.test(source);
  const hasLatin = /\p{Script=Latin}/u.test(source);

  // 明显是 XSS 或 SQL 注入内容时直接拒绝
  if (UNSAFE_PATTERNS.some((pattern) => pattern.test(source))) {
    return "UNSAFE";
  }

  // 出现非中英文脚本、或明显不是英语的拉丁重音字符，直接拒绝
  if (DISALLOWED_SCRIPT.test(source) || NON_ENGLISH_LATIN.test(source)) {
    return "NON_CN_EN";
  }

  // 既没有中文也没有英文字母（例如纯符号、纯数字），不进入翻译
  if (!hasHan && !hasLatin) {
    return "NON_CN_EN";
  }

  // 连续重复过长，通常属于无意义刷屏或乱码
  if (/(.)\1{12,}/u.test(source)) {
    return "INCOHERENT";
  }

  // 有效语言字符占比过低，说明主要是符号或无意义内容
  const languageChars =
    source.match(/[\p{Script=Han}\p{Script=Latin}\p{Number}]/gu)?.length || 0;
  if (source.length > 3 && languageChars / source.length < 0.25) {
    return "INCOHERENT";
  }

  // 英文乱敲键盘时通常没有元音；保留 yygq、thx、hmm 这类短词
  if (
    hasLatin &&
    !hasHan &&
    source.length > 8 &&
    !/[aeiouy]/i.test(source.replace(/\s/g, "")) &&
    !/\d/.test(source)
  ) {
    return "INCOHERENT";
  }

  return null;
}
