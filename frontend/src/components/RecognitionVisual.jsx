// 识别过程可视化：根据当前输入方式显示不同的动态反馈。
import { useEffect, useState } from "react";

export default function RecognitionVisual({ kind, previewUrl }) {
  const [elapsed, setElapsed] = useState("00:00");

  useEffect(() => {
    if (kind !== "video") return undefined;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
      const ss = String(seconds % 60).padStart(2, "0");
      setElapsed(`${mm}:${ss}`);
    }, 250);
    return () => clearInterval(timer);
  }, [kind]);

  if (!kind) return null;

  const labels = {
    voice: "正在听清你说的话",
    audio: "正在识别音频里的方言",
    photo: "正在扫描图片里的文字",
    video: "正在提取并识别视频语音"
  };

  return (
    <div className={`recognition-visual kind-${kind}`}>
      <div className="rv-head">
        <span className="rv-pulse" aria-hidden="true"></span>
        <span>{labels[kind] || "正在识别"}</span>
      </div>

      {(kind === "voice" || kind === "audio") && (
        <div className="rv-wave" aria-hidden="true">
          {Array.from({ length: 32 }).map((_, index) => (
            <i key={index} style={{ "--i": index }} />
          ))}
        </div>
      )}

      {kind === "photo" && (
        <div className="rv-media">
          {previewUrl ? (
            <img src={previewUrl} alt="正在识别的图片" />
          ) : (
            <div className="rv-media-placeholder">📷</div>
          )}
          <span className="rv-scan" aria-hidden="true"></span>
          <span className="rv-corner c1" aria-hidden="true"></span>
          <span className="rv-corner c2" aria-hidden="true"></span>
          <span className="rv-corner c3" aria-hidden="true"></span>
          <span className="rv-corner c4" aria-hidden="true"></span>
        </div>
      )}

      {kind === "video" && (
        <div className="rv-media">
          {previewUrl ? (
            <video src={previewUrl} muted autoPlay loop playsInline />
          ) : (
            <div className="rv-media-placeholder">🎬</div>
          )}
          <span className="rv-scan" aria-hidden="true"></span>
          <span className="rv-timecode">REC {elapsed}</span>
          <span className="rv-filmline" aria-hidden="true"></span>
        </div>
      )}
    </div>
  );
}
