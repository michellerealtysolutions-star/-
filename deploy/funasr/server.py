# FunASR 方言识别服务：提供 OpenAI 兼容的 /audio/transcriptions 接口。
import os
import re
import tempfile

from fastapi import FastAPI, File, Form, UploadFile
from funasr import AutoModel

# 模型名与运行设备可从环境变量覆盖
MODEL_NAME = os.environ.get("FUNASR_MODEL", "iic/SenseVoiceSmall")
DEVICE = os.environ.get("FUNASR_DEVICE", "cpu")

# 首次加载会自动从 ModelScope 下载模型
model = AutoModel(model=MODEL_NAME, disable_update=True, device=DEVICE)

app = FastAPI(title="FunASR 方言识别服务")


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_NAME}


@app.post("/audio/transcriptions")
async def transcribe(
    file: UploadFile = File(...),
    language: str = Form("auto"),
):
    # 保留原文件后缀，先写到临时文件再交给模型
    suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        # language=auto 时由模型自动识别语言与方言
        result = model.generate(
            input=tmp_path,
            language=language or "auto",
            use_itn=True,
        )
        text = result[0].get("text", "") if result else ""
        # 去掉 SenseVoice 附带的特殊标记，如 <|zh|>、<|Speech|>、<|EMO_UNKNOWN|>
        text = re.sub(r"<\|.*?\|>", "", text)
        # 顺带清理常见占位符并压缩多余空白
        text = re.sub(r"\[(?:UNK|PAD|MASK|EMPTY)\]", "", text, flags=re.IGNORECASE)
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\s+([，。！？,.!?])", r"\1", text)
        return {"text": text.strip()}
    finally:
        # 清理临时文件
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
