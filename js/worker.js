import { compile } from "./runtime.js";
self.onmessage = ({ data }) => {
  try {
    const result = compile(data.code);
    self.postMessage({ id: data.id, result });
  } catch (e) {
    self.postMessage({
      id: data.id,
      error: {
        line: e.line || 1,
        message: e.message,
        hint: e.hint || "코드와 지원 문법을 확인하세요.",
      },
    });
  }
};
