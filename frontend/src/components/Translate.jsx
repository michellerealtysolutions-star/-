// 统一输入页：文字 / 语音 / 图片 / 视频三合一输入，自动判断语言与方向后翻译。
import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import useRecorder from "../useRecorder.js";
import { asrError, isChinese, micError } from "../utils.js";
import RecognitionVisual from "./RecognitionVisual.jsx";

// 三种输入模式（用于轮盘切换）
const MODES = {
  text: { label: "文字", icon: "⌨️" },
  voice: { label: "语音", icon: "🎤" },
  audio: { label: "音频", icon: "🎵" },
  photo: { label: "照片", icon: "📷" },
  video: { label: "视频", icon: "🎬" }
};

const EXAMPLES = [
  "我 emo 了，想摆烂",
  "你怎么还不结婚？",
  "这波操作我真的会谢，社死了",
  "中国人能飞",
  "后生仔，唔好成日挂住玩手机，早啲瞓啦。",
  "娃儿，莫一天到黑耍手机，早点睡瞌睡。"
];

const MODE_ORDER = ["text", "voice", "audio", "photo", "video"];

const DEMO_CASES = [
  "我 emo 了，想摆烂",
  "你怎么还不结婚？",
  "这波操作我真的会谢，社死了",
  "中国人能飞",
  "后生仔，唔好成日挂住玩手机，早啲瞓啦。",
  "娃儿，莫一天到黑耍手机，早点睡瞌睡。",
  "This movie is mid, no cap",
  "I am going to attend the meeting",
  "我要杀人"
];

// 放在 public/demo 下的演示素材，方便在答辩时一键体验方言语音、梗图和视频识别
const DEMO_MEDIA = [
  { kind: "audio", label: "粤语长辈话", hint: "后生仔，唔好成日挂住玩手机…", path: "/demo/yue-elder.wav", mime: "audio/wav" },
  { kind: "audio", label: "粤语短句", hint: "你好似瘦咗啲㖞！", path: "/demo/yue-00020.wav", mime: "audio/wav" },
  { kind: "audio", label: "粤语长句", hint: "房间嘅窗帘唔够遮光…", path: "/demo/yue-01012.wav", mime: "audio/wav" },
  { kind: "photo", label: "梗图", hint: "yyds", path: "/demo/meme-yyds.png", mime: "image/png" },
  { kind: "video", label: "粤语视频", hint: "你好似瘦咗啲㖞！", path: "/demo/yue-00020.mp4", mime: "video/mp4" }
];

export default function Translate() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState("text");
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState(null);
  const [noteLabel, setNoteLabel] = useState("潜台词");
  const [resultLang, setResultLang] = useState("zh");
  const [detected, setDetected] = useState(null);
  const [noTranslation, setNoTranslation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [recognizingKind, setRecognizingKind] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [history, setHistory] = useState([]);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [demoRunning, setDemoRunning] = useState(false);
  const [demoStep, setDemoStep] = useState(0);
  const [wheelAngle, setWheelAngle] = useState(0);
  const fileRef = useRef(null);
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const demoRef = useRef(false);

  // 从本地存储恢复历史记录
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("yuyi_history_v1") || "[]");
      setHistory(Array.isArray(saved) ? saved.slice(0, 50) : []);
    } catch {
      setHistory([]);
    }
  }, []);

  // 语音输入：录音完成后交给后端 ASR 自动识别（含方言）
  const { recording, toggle } = useRecorder(
    async (blob, mime) => {
      try {
        const file = new File([blob], "recording.webm", { type: mime });
        await processAudio(file, "voice");
      } catch (err) {
        setError("语音识别失败：" + asrError(err));
      }
    },
    (err) => setError(micError(err))
  );

  // 开始识别时切换到对应的可视化状态；图片和视频会保留本地预览地址
  function startRecognition(kind, url) {
    setRecognizing(true);
    setRecognizingKind(kind);
    if (url) setPreviewUrl(url);
  }

  // 识别结束后清理可视化状态和临时预览地址
  function stopRecognition() {
    setRecognizing(false);
    setRecognizingKind(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  // 统一翻译入口：给定文本，自动判断语言与方向并直接输出成品结果
  async function translateText(inputText) {
    if (!inputText.trim() || loading) return;
    setLoading(true);
    setError("");
    setResult(null);

    const lang = isChinese(inputText) ? "zh" : "en";
    setResultLang(lang);

    try {
      const data = await api.translate(inputText.trim(), "auto", null, "gentle");
      setResult(data);
      setDetected(data.detected_direction || null);
      setNoTranslation(data.needs_translation === false);
      saveHistory({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        source: inputText.trim(),
        translation: data.translation,
        subtext: data.subtext || "",
        direction: data.detected_direction || "auto",
        needs_translation: data.needs_translation !== false,
        tone: "gentle",
        meme: data.meme || null,
        createdAt: Date.now()
      });
      setNoteLabel(
        data.needs_translation === false
          ? "说明"
          : data.meme
          ? "沟通说明"
          : lang === "zh"
          ? "潜台词"
          : data.detected_direction === "young_to_elder" ? "俚语解释" : "说明"
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // 复制译文与说明
  function copy() {
    if (!result) return;
    const parts = [
      result.translation,
      result.meme ? `梗（${result.meme.category}）：${result.meme.meaning}` : "",
      result.subtext
    ].filter(Boolean);
    navigator.clipboard
      ?.writeText(parts.join("\n\n"))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
  }

  // 朗读译文：使用浏览器自带 TTS，长辈可以直接听结果
  function speak() {
    if (
      !result ||
      typeof window === "undefined" ||
      !window.speechSynthesis ||
      typeof SpeechSynthesisUtterance === "undefined"
    ) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(result.translation);
    utterance.lang = resultLang === "zh" ? "zh-CN" : "en-US";
    utterance.rate = 0.92;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }

  // 保存历史记录到 localStorage，最多保留 50 条
  function saveHistory(record) {
    setHistory((prev) => {
      const next = [record, ...prev].slice(0, 50);
      try {
        localStorage.setItem("yuyi_history_v1", JSON.stringify(next));
      } catch {
        // 本地存储不可用时静默失败
      }
      return next;
    });
  }

  // 把历史记录重新载入输入框并翻译
  function loadHistory(item) {
    if (!item) return;
    setText(item.source);
    translateText(item.source);
  }

  function toggleFavorite(id) {
    setHistory((prev) => {
      const next = prev.map((item) => item.id === id ? { ...item, favorite: !item.favorite } : item);
      try {
        localStorage.setItem("yuyi_history_v1", JSON.stringify(next));
      } catch {
        // 本地存储不可用时静默失败
      }
      return next;
    });
  }

  function removeHistory(id) {
    setHistory((prev) => {
      const next = prev.filter((item) => item.id !== id);
      try {
        localStorage.setItem("yuyi_history_v1", JSON.stringify(next));
      } catch {
        // 本地存储不可用时静默失败
      }
      return next;
    });
  }

  async function submitFeedback() {
    if (!result || !feedbackText.trim() || feedbackSaving) return;
    setFeedbackSaving(true);
    try {
      await api.report({
        text,
        translation: result.translation,
        subtext: result.subtext || "",
        feedback: feedbackText.trim()
      });
      setFeedbackText("");
      setFeedbackOpen(false);
      setError("");
    } catch (err) {
      setError("反馈提交失败：" + err.message);
    } finally {
      setFeedbackSaving(false);
    }
  }

  // 点击示例后填入输入框并直接翻译
  function runExample(example) {
    setText(example);
    translateText(example);
  }

  async function startDemo() {
    if (demoRunning || loading) return;
    demoRef.current = true;
    setDemoRunning(true);
    setError("");
    setResult(null);

    for (let index = 0; index < DEMO_CASES.length; index += 1) {
      if (!demoRef.current) break;
      setDemoStep(index + 1);
      setText(DEMO_CASES[index]);
      await translateText(DEMO_CASES[index]);
      await sleep(4200);
    }

    demoRef.current = false;
    setDemoRunning(false);
    setDemoStep(0);
  }

  function stopDemo() {
    demoRef.current = false;
    setDemoRunning(false);
    setDemoStep(0);
  }

  function rotateWheel(event) {
    setWheelAngle((prev) => prev + (event.deltaY > 0 ? 36 : -36));
  }

  function startWheelDrag(event) {
    const startX = event.clientX;
    const startAngle = wheelAngle;

    function move(ev) {
      setWheelAngle(startAngle + (ev.clientX - startX) * 0.45);
    }

    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function openImage() {
    fileRef.current?.click();
  }

  function openVideo() {
    videoRef.current?.click();
  }

  function openAudio() {
    audioRef.current?.click();
  }

  // 主按钮：录音中则停止，否则展开/收起输入方式菜单
  function handleFab() {
    if (recording) {
      toggle();
      return;
    }
    setOpen((prev) => !prev);
  }

  function selectText() {
    setMode("text");
    setOpen(false);
  }

  const modeActions = {
    text: selectText,
    voice: selectVoice,
    audio: selectAudio,
    photo: selectPhoto,
    video: selectVideo
  };

  // 选择语音并开始录音
  function selectVoice() {
    setMode("voice");
    setOpen(false);
    toggle();
  }

  // 选择照片并直接打开图片选择器
  function selectPhoto() {
    setMode("photo");
    setOpen(false);
    openImage();
  }

  // 选择视频并直接打开视频选择器
  function selectVideo() {
    setMode("video");
    setOpen(false);
    openVideo();
  }

  // 选择音频文件上传，走与录音相同的 ASR 识别流程
  function selectAudio() {
    setMode("audio");
    setOpen(false);
    openAudio();
  }

  // 处理音频文件：读取文件后交给后端 ASR 转写，再自动翻译
  async function processAudio(file, kind = "audio") {
    startRecognition(kind);
    setError("");
    try {
      const audioBase64 = await blobToBase64(file);
      const data = await api.transcribe(audioBase64, file.type || "audio/mpeg", "auto");
      if (data.text) {
        setText(data.text);
        await translateText(data.text);
      } else {
        setError("没有在音频中识别到语音内容");
      }
    } catch (err) {
      setError("音频识别失败：" + asrError(err));
    } finally {
      stopRecognition();
    }
  }

  // 音频文件上传：读取文件后交给后端 ASR 转写，再自动翻译
  async function handleAudio(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await processAudio(file);
  }

  // 图片输入：用 Tesseract.js 做 OCR，把识别文字填入输入框
  async function processImage(file) {
    startRecognition("photo", URL.createObjectURL(file));
    setError("");
    let worker;
    try {
      const { createWorker } = await import("tesseract.js");
      worker = await createWorker("chi_sim+eng", 1, {
        workerPath: "/tesseract/worker.min.js",
        corePath: "/tesseract/core",
        langPath: "/tesseract/lang",
        gzip: true
      });
      const { data } = await worker.recognize(file);
      const recognized = (data.text || "").trim();
      if (recognized) {
        // 图片内容先做安全预检，命中敏感内容时不展示、不翻译
        const check = await api.moderate(recognized);
        if (check.blocked) {
          setError(check.message || "这段内容涉及敏感信息，我无法处理");
          return;
        }
        setText(recognized);
        await translateText(recognized);
      } else {
        setError("没有在图片中识别到文字，请换一张更清晰的图片");
      }
    } catch (err) {
      setError("图片识别失败：" + err.message);
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch {
          // worker 终止失败不影响主流程
        }
      }
      stopRecognition();
    }
  }

  async function handleImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await processImage(file);
  }

  // 视频输入：先提取音频，再交给后端 ASR 转写
  async function processVideo(file) {
    startRecognition("video", URL.createObjectURL(file));
    setError("");
    try {
      const data = await api.transcribeVideo(file, "auto");
      if (data.text) {
        setText(data.text);
        await translateText(data.text);
      } else {
        setError("没有在视频中识别到语音内容");
      }
    } catch (err) {
      setError("视频识别失败：" + asrError(err));
    } finally {
      stopRecognition();
    }
  }

  async function handleVideo(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await processVideo(file);
  }

  // 加载并处理内置的方言/梗演示素材
  async function runDemoMedia(item) {
    if (loading || recognizing) return;
    setMode(item.kind);
    setError("");
    setResult(null);
    try {
      const response = await fetch(item.path);
      if (!response.ok) throw new Error("素材加载失败");
      const blob = await response.blob();
      const file = new File([blob], item.path.split("/").pop() || "demo", { type: item.mime });
      if (item.kind === "audio") await processAudio(file);
      if (item.kind === "photo") await processImage(file);
      if (item.kind === "video") await processVideo(file);
    } catch (err) {
      setError("演示素材处理失败：" + err.message);
    }
  }

  return (
    <section className="page">
      <div className="mode-bar">
        <span className={`mode-pill ${mode === "text" ? "active" : ""}`}>
          当前：{MODES[mode].label}输入
        </span>
      </div>

      <div className="input-wrap">
        <textarea
          rows="6"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="输入文字，或用右下角的轮盘切换语音 / 音频 / 照片 / 视频"
        />
        <div className="dial-wrap">
          {open && (
            <div
              className="dial-menu"
              style={{ "--wheel-angle": `${wheelAngle}deg` }}
              onWheel={rotateWheel}
              onPointerDown={startWheelDrag}
            >
              {MODE_ORDER.map((key, index) => (
                <button
                  key={key}
                  className="dial-item"
                  style={{ "--i": index, "--count": MODE_ORDER.length }}
                  onClick={modeActions[key]}
                  title={MODES[key].label}
                >
                  {MODES[key].icon}
                </button>
              ))}
            </div>
          )}
          <button
            className={`dial-fab ${recording ? "recording" : ""}`}
            onClick={handleFab}
            title={recording ? "停止录音" : open ? "收起" : "选择输入方式"}
          >
            <span key={mode} className="dial-icon">{open ? "✕" : MODES[mode].icon}</span>
          </button>
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={handleImage} />
      <input ref={videoRef} type="file" accept="video/*" hidden onChange={handleVideo} />
      <input ref={audioRef} type="file" accept="audio/*" hidden onChange={handleAudio} />

      <div className="examples">
        <span className="label">快速试试</span>
        <div className="example-chips">
          {EXAMPLES.map((example) => (
            <button key={example} className="example-chip" onClick={() => runExample(example)}>
              {example}
            </button>
          ))}
        </div>
      </div>

      <div className="demo-row">
        <button className="demo-btn" onClick={demoRunning ? stopDemo : startDemo}>
          {demoRunning ? "停止演示" : "自动演示"}
        </button>
        {demoRunning && (
          <span className="demo-progress">
            第 {demoStep} / {DEMO_CASES.length} 步
          </span>
        )}
      </div>

      <RecognitionVisual kind={recognizingKind} previewUrl={previewUrl} />

      <button className="primary" disabled={!text.trim() || loading} onClick={() => translateText(text)}>
        {loading ? "翻译中…" : "翻译"}
      </button>

      {error && <div className="error">{error}</div>}

      {result && (
        <div className="result">
          {detected && (
            <span className="detected">
              {resultLang === "en"
                ? detected === "elder_to_young"
                  ? "检测到长辈英语 → 已转成年轻英语"
                  : "检测到年轻英语 → 已转成长辈英语"
                : detected === "elder_to_young"
                  ? "检测到长辈话 → 已转成年轻说法"
                  : "检测到年轻话 → 已转成长辈说法"}
            </span>
          )}
          <div className={`card ${noTranslation ? "no-translation" : ""}`}>
            <span className="label">{noTranslation ? "无需翻译" : "译文"}</span>
            <p>{result.translation}</p>
          </div>
          {result.meme && (
            <div className="card meme">
              <span className="label">梗 · {result.meme.category}</span>
              <p>{result.meme.meaning}</p>
            </div>
          )}
          {result.subtext && (
            <div className="card sub">
              <span className="label">{noteLabel}</span>
              <p>{result.subtext}</p>
            </div>
          )}
          <div className="result-actions">
            <button className="ghost" onClick={copy}>{copied ? "已复制" : "复制"}</button>
            <button className="ghost" onClick={speak} disabled={!window.speechSynthesis}>
              {speaking ? "播放中…" : "朗读"}
            </button>
            <button className="ghost" onClick={() => setFeedbackOpen((prev) => !prev)}>反馈</button>
          </div>
          {feedbackOpen && (
            <div className="card feedback-card">
              <span className="label">哪里翻译得不好？</span>
              <textarea
                rows="3"
                value={feedbackText}
                onChange={(event) => setFeedbackText(event.target.value)}
                placeholder="例如：这句应该是长辈对晚辈说的，不是年轻话。"
              />
              <div className="feedback-actions">
                <button className="ghost" onClick={submitFeedback} disabled={!feedbackText.trim() || feedbackSaving}>
                  {feedbackSaving ? "提交中…" : "提交反馈"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {history.length > 0 && (
        <details className="history">
          <summary className="history-summary">
            <span className="label">历史记录</span>
            <button className="ghost small" onClick={(event) => { event.preventDefault(); setHistory([]); }}>清空</button>
          </summary>
          {history.map((item) => (
            <div key={item.id} className={`history-item ${item.favorite ? "favorite" : ""}`}>
              <div className="history-main" onClick={() => loadHistory(item)} role="button" tabIndex={0}>
                <p className="history-source">{item.source}</p>
                <p className="history-result">{item.translation}</p>
              </div>
              <div className="history-actions">
                <button className="ghost small" onClick={() => toggleFavorite(item.id)}>
                  {item.favorite ? "★" : "☆"}
                </button>
                <button className="ghost small" onClick={() => removeHistory(item.id)}>删除</button>
              </div>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}

// 把 Blob 转成 base64 字符串，方便 JSON 传输
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("读取音频失败"));
    reader.readAsDataURL(blob);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
