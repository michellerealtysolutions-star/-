// 应用根组件：品牌区 + 统一翻译输入页
import { useEffect, useState } from "react";
import Translate from "./components/Translate.jsx";
import { api } from "./api.js";

export default function App() {
  const [large, setLarge] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [entered, setEntered] = useState(false);
  const [feedbackCount, setFeedbackCount] = useState(0);

  useEffect(() => {
    try {
      setLarge(localStorage.getItem("yuyi_large_font") === "1");
    } catch {
      setLarge(false);
    }
  }, []);

  useEffect(() => {
    api.reportStats()
      .then((data) => setFeedbackCount(data.count || 0))
      .catch(() => setFeedbackCount(0));
  }, []);

  function toggleLarge() {
    setLarge((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("yuyi_large_font", next ? "1" : "0");
      } catch {
        // 本地存储不可用时静默失败
      }
      return next;
    });
  }

  if (!entered) {
    return (
      <main className="landing-shell">
        <section className="landing">
          <div className="landing-orb orb-a"></div>
          <div className="landing-orb orb-b"></div>
          <p className="landing-logo landing-anim-1">语译</p>
          <h1 className="landing-anim-2">把代沟，翻译成理解</h1>
          <p className="landing-subtitle landing-anim-3">
            年轻人说话，长辈听不懂；长辈关心，年轻人嫌唠叨。
            <br />
            语译把两边的话都翻译成人人都能接受的说法。
          </p>
          <div className="landing-features landing-anim-4">
            <span>中英自动识别</span>
            <span>方言与网络梗解释</span>
            <span>语音 / 图片 / 视频输入</span>
          </div>
          <button className="landing-enter landing-anim-5" onClick={() => setEntered(true)}>
            开始体验
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className={`app-shell screen-enter ${large ? "large-font" : ""}`}>
      <div className="topbar">
        <button className="icon-btn" onClick={toggleLarge} title={large ? "标准字号" : "大字模式"}>
          {large ? "Aa" : "A+"}
        </button>
        <button className="icon-btn" onClick={() => setPrivacyOpen(true)} title="隐私说明">
          ?
        </button>
      </div>

      <div className="brand compact">
        <p className="logo">语译</p>
        <h1>把代沟，翻译成理解</h1>
        <p className="tagline">
          一个输入框，中英文自动识别，把年轻话、长辈话和没说出口的潜台词都说清楚。
        </p>
      </div>

      <Translate />

      <footer className="app-footer">
        <button className="text-btn" onClick={() => setPrivacyOpen(true)}>
          隐私说明
        </button>
        <span className="footer-note">已收到 {feedbackCount} 条反馈</span>
      </footer>

      {privacyOpen && (
        <div className="privacy-mask" onClick={() => setPrivacyOpen(false)}>
          <div className="privacy-panel" onClick={(event) => event.stopPropagation()}>
            <div className="privacy-head">
              <span className="label">隐私说明</span>
              <button className="icon-btn" onClick={() => setPrivacyOpen(false)}>×</button>
            </div>
            <p>我们默认在本地处理你的输入。文字翻译会发送到已配置的大模型接口；语音和视频识别会发送到本地部署的方言识别服务。</p>
            <p>我们不会保存你的语音、图片或视频文件，也不会把识别内容用于其他用途。历史记录只保存在你当前浏览器的本地存储中。</p>
            <p>如果检测到色情、暴力或政治敏感内容，系统会直接拦截，不会生成回答。</p>
          </div>
        </div>
      )}
    </main>
  );
}
