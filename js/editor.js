const escape = (s) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
function color(s) {
  const re =
    /(#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b\d+(?:\.\d+)?\b|\b(?:for|in|if|else)\b|\b(?:posx|trans|movel|range|tp_log|wait)\b|\bDR_BASE\b)/g;
  let out = "",
    last = 0;
  for (const m of s.matchAll(re)) {
    out += escape(s.slice(last, m.index));
    let v = m[0],
      c =
        v[0] === "#"
          ? "comment"
          : /^["']/.test(v)
            ? "string"
            : /^\d/.test(v)
              ? "num"
              : /^(for|in|if|else)$/.test(v)
                ? "key"
                : v === "DR_BASE"
                  ? "const"
                  : "fn";
    out += `<span class="tok-${c}">${escape(v)}</span>`;
    last = m.index + v.length;
  }
  return out + escape(s.slice(last));
}
export class Editor {
  constructor(onChange) {
    this.input = document.querySelector("#code");
    this.pre = document.querySelector("#highlight");
    this.numbers = document.querySelector("#lineNumbers");
    this.active = 0;
    this.input.addEventListener("input", () => {
      this.render();
      onChange(this.value);
    });
    this.input.addEventListener("scroll", () => this.sync());
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        let start = this.input.selectionStart,
          end = this.input.selectionEnd;
        this.input.setRangeText("    ", start, end, "end");
        this.input.dispatchEvent(new Event("input"));
      }
    });
    ["click", "keyup", "select"].forEach((e) =>
      this.input.addEventListener(e, () => this.cursor()),
    );
  }
  get value() {
    return this.input.value;
  }
  set value(v) {
    this.input.value = v;
    this.render();
  }
  render() {
    let lines = this.value.split("\n");
    this.pre.innerHTML = lines
      .map(
        (s, i) =>
          `<span class="code-line ${i + 1 === this.active ? "active" : ""}">${color(s) || " "}</span>`,
      )
      .join("");
    this.numbers.innerHTML = lines
      .map(
        (_, i) =>
          `<div class="${i + 1 === this.active ? "active" : ""}">${i + 1}</div>`,
      )
      .join("");
    this.sync();
    this.cursor();
  }
  sync() {
    this.pre.scrollTop = this.input.scrollTop;
    this.pre.scrollLeft = this.input.scrollLeft;
    this.numbers.scrollTop = this.input.scrollTop;
  }
  cursor() {
    let before = this.value.slice(0, this.input.selectionStart),
      parts = before.split("\n");
    document.querySelector("#cursorInfo").textContent =
      `Ln ${parts.length}, Col ${parts.at(-1).length + 1}`;
  }
  mark(line) {
    this.active = line || 0;
    this.render();
    if (line) {
      let y = (line - 1) * 25;
      if (
        y < this.input.scrollTop ||
        y > this.input.scrollTop + this.input.clientHeight - 45
      )
        this.input.scrollTop = Math.max(0, y - 90);
      this.sync();
    }
  }
}
