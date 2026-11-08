export class DrlError extends Error {
  constructor(line, message, hint = "지원 문법 도움말과 예제를 확인하세요.") {
    super(message);
    this.line = line;
    this.hint = hint;
  }
}
function tokenize(s, line) {
  let a = [],
    i = 0;
  while (i < s.length) {
    if (/\s/.test(s[i])) {
      i++;
      continue;
    }
    if (s[i] === "#") break;
    let m = s.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
    if (m) {
      a.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    m = s.slice(i).match(/^[A-Za-z_][A-Za-z_0-9]*/);
    if (m) {
      a.push({ t: m[0], v: m[0] });
      i += m[0].length;
      continue;
    }
    if (s[i] === '"' || s[i] === "'") {
      let q = s[i++],
        v = "";
      if (s.slice(i, i + 2) === q + q)
        throw new DrlError(line, "여러 줄 문자열은 지원하지 않습니다.");
      while (i < s.length && s[i] !== q) {
        if (s[i] === "\\") {
          i++;
          v += { n: "\n", t: "\t" }[s[i]] ?? s[i];
          i++;
        } else v += s[i++];
      }
      if (s[i++] !== q)
        throw new DrlError(line, "문자열의 따옴표가 닫히지 않았습니다.");
      if (v.length > 500)
        throw new DrlError(line, "문자열은 500자 이하로 써 주세요.");
      a.push({ t: "str", v });
      continue;
    }
    let op =
      ["//", "==", "!=", "<=", ">="].find((x) => s.startsWith(x, i)) || s[i];
    if (
      ![
        "//",
        "==",
        "!=",
        "<=",
        ">=",
        "+",
        "-",
        "*",
        "/",
        "%",
        "<",
        ">",
        "=",
        "(",
        ")",
        "[",
        "]",
        ",",
        ":",
      ].includes(op)
    )
      throw new DrlError(line, `지원하지 않는 문자: ${op}`);
    a.push({ t: op, v: op });
    i += op.length;
  }
  a.push({ t: "EOF" });
  return a;
}
export function expression(s, line = 1) {
  return new Expr(tokenize(s, line), line).full();
}
class Expr {
  constructor(tokens, line) {
    this.a = tokens;
    this.i = 0;
    this.line = line;
  }
  peek(t, n = 0) {
    return this.a[this.i + n]?.t === t;
  }
  take(t) {
    if (!this.peek(t))
      throw new DrlError(
        this.line,
        `'${t}'가 필요합니다. 괄호와 쉼표를 확인하세요.`,
      );
    return this.a[this.i++];
  }
  full() {
    let n = this.expr();
    this.take("EOF");
    return n;
  }
  expr() {
    let a = this.binary(0);
    if (this.peek("if")) {
      this.i++;
      let c = this.binary(0);
      this.take("else");
      let b = this.expr();
      return { k: "cond", a, c, b };
    }
    return a;
  }
  binary(min) {
    const p = {
      "==": 1,
      "!=": 1,
      "<": 1,
      ">": 1,
      "<=": 1,
      ">=": 1,
      "+": 2,
      "-": 2,
      "*": 3,
      "/": 3,
      "//": 3,
      "%": 3,
    };
    let a = this.atom();
    while ((p[this.a[this.i].t] || 0) > min) {
      let op = this.a[this.i++].t,
        b = this.binary(p[op]);
      if (p[op] === 1) {
        if (a.k === "compare") a.rest.push({ op, b });
        else a = { k: "compare", left: a, rest: [{ op, b }] };
      } else a = { k: "bin", op, a, b };
    }
    return a;
  }
  atom() {
    let t = this.a[this.i++],
      n;
    if (t.t === "num" || t.t === "str") n = { k: "lit", v: t.v };
    else if (t.t === "-" || t.t === "+")
      n = { k: "un", op: t.t, a: this.binary(3) };
    else if (t.t === "(") {
      n = this.expr();
      this.take(")");
    } else if (t.t === "[") {
      let items = [];
      if (!this.peek("]")) {
        do {
          items.push(this.expr());
          if (!this.peek(",")) break;
          this.i++;
          if (this.peek("]")) break;
        } while (true);
      }
      this.take("]");
      n = { k: "list", items };
    } else if (
      /^[A-Za-z_]/.test(t.t) &&
      ![
        "if",
        "else",
        "for",
        "in",
        "EOF",
        "while",
        "import",
        "def",
        "True",
        "False",
      ].includes(t.t)
    ) {
      n = { k: "name", v: t.v };
    } else
      throw new DrlError(
        this.line,
        "식을 읽을 수 없습니다. 괄호와 값을 확인하세요.",
      );
    while (this.peek("[") || this.peek("(")) {
      if (this.peek("[")) {
        this.i++;
        let index = this.expr();
        this.take("]");
        n = { k: "index", a: n, index };
      } else {
        if (n.k !== "name")
          throw new DrlError(
            this.line,
            "허용된 명령 이름으로만 호출할 수 있습니다.",
          );
        this.i++;
        let args = [],
          kwargs = {};
        if (!this.peek(")"))
          do {
            if (/^[A-Za-z_]/.test(this.a[this.i].t) && this.peek("=", 1)) {
              let key = this.a[this.i++].v;
              this.i++;
              if (key in kwargs)
                throw new DrlError(this.line, `중복 인수: ${key}`);
              kwargs[key] = this.expr();
            } else {
              if (Object.keys(kwargs).length)
                throw new DrlError(
                  this.line,
                  "위치 인수는 이름 인수보다 먼저 쓰세요.",
                );
              args.push(this.expr());
            }
            if (!this.peek(",")) break;
            this.i++;
            if (this.peek(")")) break;
          } while (true);
        this.take(")");
        n = { k: "call", name: n.v, args, kwargs };
      }
    }
    return n;
  }
}
export function parse(source) {
  if (source.length > 60000)
    throw new DrlError(1, "코드는 60,000자 이하로 작성하세요.");
  let lines = source
    .split(/\r?\n/)
    .map((raw, i) => ({ raw, line: i + 1, indent: raw.match(/^ */)[0].length }))
    .filter((x) => x.raw.trim() && !x.raw.trim().startsWith("#"));
  for (const l of lines)
    if (/^\s*\t/.test(l.raw) || /^ *.*\t/.test(l.raw))
      throw new DrlError(l.line, "탭 대신 공백 4개로 들여쓰기하세요.");
  let idx = 0;
  function block(indent, depth = 0) {
    if (depth > 24)
      throw new DrlError(
        lines[idx]?.line || 1,
        "블록 중첩은 24단계까지 지원합니다.",
      );
    let out = [];
    while (idx < lines.length) {
      let l = lines[idx];
      if (l.indent < indent) break;
      if (l.indent !== indent)
        throw new DrlError(
          l.line,
          "들여쓰기가 맞지 않습니다.",
          "같은 블록은 공백 수를 맞추고, 안쪽 블록은 공백 4개를 추가하세요.",
        );
      idx++;
      let s = l.raw.trim(),
        node = { line: l.line };
      if (/^(while|def|import|from|class|return|break|continue)\b/.test(s))
        throw new DrlError(
          l.line,
          "지원 범위 밖 문장입니다: " + s.split(/\s/)[0],
        );
      if (s.startsWith("for ")) {
        let m = s.match(/^for\s+([A-Za-z_]\w*)\s+in\s+(.+?):\s*(?:#.*)?$/);
        if (!m)
          throw new DrlError(
            l.line,
            "for 문법을 확인하세요.",
            "for i in range(12):",
          );
        node = {
          ...node,
          k: "for",
          name: m[1],
          iter: expression(m[2], l.line),
        };
      } else if (s.startsWith("if ")) {
        let m = s.match(/^if\s+(.+?):\s*(?:#.*)?$/);
        if (!m) throw new DrlError(l.line, "if 끝에는 :이 필요합니다.");
        node = { ...node, k: "if", test: expression(m[1], l.line) };
      } else if (s.startsWith("else"))
        throw new DrlError(
          l.line,
          "else는 같은 들여쓰기의 if 바로 뒤에 써 주세요.",
        );
      else {
        let ts = tokenize(s, l.line),
          eq = ts.findIndex((t) => t.t === "=");
        let level = 0;
        eq = -1;
        for (let i = 0; i < ts.length; i++) {
          if (["(", "["].includes(ts[i].t)) level++;
          if ([")", "]"].includes(ts[i].t)) level--;
          if (ts[i].t === "=" && level === 0) {
            eq = i;
            break;
          }
        }
        if (eq >= 0) {
          let left = new Expr(
            [...ts.slice(0, eq), { t: "EOF" }],
            l.line,
          ).full();
          if (left.k !== "name" && left.k !== "index")
            throw new DrlError(
              l.line,
              "대입할 변수 또는 리스트 인덱스가 필요합니다.",
            );
          node = {
            ...node,
            k: "assign",
            left,
            value: new Expr(ts.slice(eq + 1), l.line).full(),
          };
        } else
          node = { ...node, k: "expr", value: new Expr(ts, l.line).full() };
      }
      if (node.k === "for" || node.k === "if") {
        if (!lines[idx] || lines[idx].indent <= indent)
          throw new DrlError(l.line, "블록 안의 문장을 들여쓰기하세요.");
        node.body = block(lines[idx].indent, depth + 1);
        if (
          node.k === "if" &&
          lines[idx]?.indent === indent &&
          /^else\s*:\s*(?:#.*)?$/.test(lines[idx].raw.trim())
        ) {
          let el = lines[idx++];
          if (!lines[idx] || lines[idx].indent <= indent)
            throw new DrlError(el.line, "else 블록의 문장을 들여쓰기하세요.");
          node.other = block(lines[idx].indent, depth + 1);
        }
      }
      out.push(node);
    }
    return out;
  }
  return block(0);
}
