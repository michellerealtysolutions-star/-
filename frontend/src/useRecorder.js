// 录音 hook：用 MediaRecorder 采集麦克风音频，结束后把音频 Blob 回传
import { useRef, useState } from "react";

export default function useRecorder(onResult, onError) {
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const discardRef = useRef(false);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  onResultRef.current = onResult;
  onErrorRef.current = onError;

  // 浏览器是否支持麦克风采集
  const supported = Boolean(
    typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia
  );

  async function toggle() {
    // 正在录音时再次点击，则停止录音
    if (recording) {
      recorderRef.current?.stop();
      return;
    }

    // 不支持麦克风或 MediaRecorder 时，提前给出友好错误
    if (!supported || typeof MediaRecorder === "undefined") {
      onErrorRef.current?.(new Error("当前浏览器不支持麦克风录音"));
      return;
    }

    try {
      // 获取麦克风音频流并开始录制
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      // 分片收集音频数据
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      // 停止后把完整音频 Blob 交给调用方
      recorder.onstop = () => {
        setRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        // 只有非「丢弃」的停止才触发识别回调
        if (!discardRef.current) {
          onResultRef.current?.(blob, mimeType);
        }
        discardRef.current = false;
      };

      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (err) {
      setRecording(false);
      onErrorRef.current?.(err);
    }
  }

  // 停止录音但不触发识别（例如切换模式时主动丢弃）
  function discard() {
    if (recording) {
      discardRef.current = true;
      recorderRef.current?.stop();
    }
  }

  return { supported, recording, toggle, discard };
}
