// 前端纯函数单元测试。
import test from "node:test";
import assert from "node:assert/strict";
import { isChinese, micError, asrError } from "../src/utils.js";

test("isChinese 能识别中文", () => {
  assert.equal(isChinese("你好"), true);
  assert.equal(isChinese("hello"), false);
});

test("micError 能映射常见麦克风错误", () => {
  assert.equal(micError({ name: "NotAllowedError" }), "请允许浏览器使用麦克风");
  assert.equal(micError({ name: "NotFoundError" }), "未检测到麦克风设备");
});

test("asrError 会给出降级提示", () => {
  assert.match(asrError({ message: "ASR_NOT_CONFIGURED" }), /语音识别服务暂时不可用/);
  assert.equal(asrError({ message: "其他问题" }), "其他问题");
});
