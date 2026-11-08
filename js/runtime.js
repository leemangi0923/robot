import { parse, DrlError } from "./parser.js";
import { INITIAL, SEED, planMotion } from "./robot.js";
const isPose = (x) => x && x.type === "pose";
export const values = (p) => p.values;
export function compile(code, { paths = true, onProgress = () => {} } = {}) {
  let ast = parse(code),
    env = Object.create(null),
    events = [],
    motions = [],
    current = [...INITIAL],
    q = [...SEED],
    steps = 0,
    loops = 0,
    iterations = 0,
    samples = 0,
    start = Date.now(),
    line = 1;
  env.DR_BASE = 0;
  const fail = (msg, hint) => {
    throw new DrlError(line, msg, hint);
  };
  const budget = () => {
    iterations++;
    if (iterations > 250000 || Date.now() - start > 15000)
      fail(
        "경로 계산 제한에 도달했습니다.",
        "이동 횟수나 이동 거리를 줄여 주세요.",
      );
  };
  const tick = () => {
    if (++steps > 20000 || Date.now() - start > 15000)
      fail(
        "실행 한도에 도달했습니다.",
        "반복 횟수를 1,000회 이하로 줄여 주세요.",
      );
  };
  const number = (v) => {
    if (typeof v !== "number" || !Number.isFinite(v))
      fail("유한한 숫자가 필요합니다.");
    return v;
  };
  const list = (v) => {
    if (!Array.isArray(v)) fail("리스트가 필요합니다.");
    return v;
  };
  const pose = (v) => {
    if (!isPose(v)) {
      if (Array.isArray(v) && v.some(isPose))
        fail(
          "pos_g는 좌표 목록입니다. 한 점은 pos_g[0]처럼 선택하세요.",
          "movel(pos_g[0], vel=100, acc=100, ref=DR_BASE)",
        );
      fail(
        "posx로 만든 자세 한 개가 필요합니다.",
        "p = posx(362.54, 422.29, 248.28, 180, -90, 0)",
      );
    }
    return v.values;
  };
  function index(a, i) {
    list(a);
    number(i);
    if (!Number.isInteger(i)) fail("리스트 인덱스는 정수여야 합니다.");
    let k = i < 0 ? a.length + i : i;
    if (k < 0 || k >= a.length)
      fail(
        `인덱스 ${i}가 범위를 벗어났습니다. (길이 ${a.length})`,
        "0부터 리스트 길이−1 사이의 인덱스를 선택하세요.",
      );
    return k;
  }
  function ev(n) {
    tick();
    switch (n.k) {
      case "lit":
        return n.v;
      case "name":
        if (!(n.v in env))
          fail(
            `정의되지 않은 변수: ${n.v}`,
            "변수 이름을 확인하고 사용하기 전에 값을 대입하세요.",
          );
        return env[n.v];
      case "list":
        if (n.items.length > 1000)
          fail("리스트 크기는 1,000개까지 지원합니다.");
        return n.items.map(ev);
      case "index": {
        let a = ev(n.a);
        return a[index(a, ev(n.index))];
      }
      case "un":
        return n.op === "-" ? -number(ev(n.a)) : number(ev(n.a));
      case "cond":
        return ev(n.c) ? ev(n.a) : ev(n.b);
      case "compare": {
        let a = number(ev(n.left));
        for (const part of n.rest) {
          let b = number(ev(part.b)),
            ok =
              part.op === "=="
                ? a === b
                : part.op === "!="
                  ? a !== b
                  : part.op === "<"
                    ? a < b
                    : part.op === ">"
                      ? a > b
                      : part.op === "<="
                        ? a <= b
                        : a >= b;
          if (!ok) return false;
          a = b;
        }
        return true;
      }
      case "bin": {
        let a = ev(n.a),
          b = ev(n.b);
        if (n.op === "*" && (Array.isArray(a) || Array.isArray(b))) {
          let arr = Array.isArray(a) ? a : b,
            count = number(Array.isArray(a) ? b : a);
          if (
            !Number.isInteger(count) ||
            count < 0 ||
            count > 1000 ||
            count * arr.length > 1000
          )
            fail("리스트 반복 크기는 0~1,000개 정수로 제한됩니다.");
          return Array.from({ length: count }, () => arr).flat();
        }
        number(a);
        number(b);
        let r;
        switch (n.op) {
          case "+":
            r = a + b;
            break;
          case "-":
            r = a - b;
            break;
          case "*":
            r = a * b;
            break;
          case "/":
          case "//":
          case "%":
            if (b === 0) fail("0으로 나눌 수 없습니다.");
            r =
              n.op === "/"
                ? a / b
                : n.op === "//"
                  ? Math.floor(a / b)
                  : a - Math.floor(a / b) * b;
            break;
          case "==":
            return a === b;
          case "!=":
            return a !== b;
          case "<":
            return a < b;
          case ">":
            return a > b;
          case "<=":
            return a <= b;
          case ">=":
            return a >= b;
        }
        return number(r);
      }
      case "call": {
        const allowed = ["posx", "trans", "movel", "range", "wait", "tp_log"];
        if (!allowed.includes(n.name)) fail(`지원하지 않는 명령: ${n.name}`);
        let a = n.args.map(ev),
          k = Object.fromEntries(
            Object.entries(n.kwargs).map(([x, y]) => [x, ev(y)]),
          );
        const keys = (allowed) => {
          for (let key in k)
            if (!allowed.includes(key))
              fail(
                `지원하지 않는 ${n.name} 인수: ${key}`,
                "도움말에서 지원 인수를 확인하세요.",
              );
        };
        switch (n.name) {
          case "posx":
            keys([]);
            if (a.length === 1 && Array.isArray(a[0])) a = a[0];
            if (a.length !== 6) fail("posx는 숫자 6개가 필요합니다.");
            return { type: "pose", values: a.map(number) };
          case "trans": {
            keys(["ref", "ref_out"]);
            if (a.length < 2 || a.length > 4)
              fail("trans에는 자세와 변화량이 필요합니다.");
            if (
              (a.length > 2 && "ref" in k) ||
              (a.length > 3 && "ref_out" in k)
            )
              fail("같은 인수를 두 번 지정할 수 없습니다.");
            let p = pose(a[0]),
              d = list(a[1]);
            if (d.length !== 6)
              fail(
                "delta는 숫자 6개가 필요합니다.",
                "trans(p, [0, 0, 20, 0, 0, 0], ref=DR_BASE)",
              );
            d.forEach(number);
            if (d.slice(3).some((x) => x !== 0))
              fail("trans는 회전 변화량이 0인 경우만 지원합니다.");
            if ((a[2] ?? k.ref ?? 0) !== 0 || (a[3] ?? k.ref_out ?? 0) !== 0)
              fail("trans는 DR_BASE 좌표계만 지원합니다.");
            return {
              type: "pose",
              values: p.map((x, i) => (i < 3 ? number(x + d[i]) : x)),
            };
          }
          case "range":
            keys([]);
            if (
              a.length < 1 ||
              a.length > 2 ||
              a.some((x) => !Number.isInteger(x))
            )
              fail("range(stop) 또는 range(start, stop)에 정수를 쓰세요.");
            {
              let lo = a.length === 1 ? 0 : a[0],
                hi = a.at(-1);
              if (hi - lo > 1000) fail("range는 최대 1,000회입니다.");
              return Array.from(
                { length: Math.max(0, hi - lo) },
                (_, i) => lo + i,
              );
            }
          case "wait":
            keys([]);
            if (a.length !== 1 || typeof a[0] !== "number")
              fail("wait에는 초 단위 숫자 하나를 쓰세요.", "wait(1.0)");
            if (number(a[0]) < 0 || a[0] > 60)
              fail("wait는 0~60초로 제한됩니다.");
            pending = { kind: "wait", duration: a[0] };
            return null;
          case "tp_log":
            keys([]);
            if (a.length !== 1 || typeof a[0] !== "string")
              fail(
                "tp_log에는 짧은 문자열 하나를 쓰세요.",
                'tp_log("이동 완료")',
              );
            pending = { kind: "log", message: a[0] };
            return null;
          case "movel": {
            keys(["vel", "acc", "ref"]);
            if (a.length !== 1)
              fail(
                "movel은 자세 한 개와 vel, acc, ref 이름 인수를 지원합니다.",
              );
            let to = pose(a[0]);
            if ((k.ref ?? 0) !== 0)
              fail("movel은 DR_BASE의 절대 이동만 지원합니다.");
            let v = number(k.vel),
              acc = number(k.acc);
            if (v <= 0 || acc <= 0 || v > 2000 || acc > 10000)
              fail(
                "vel은 0 초과 2,000 이하, acc는 0 초과 10,000 이하 숫자를 쓰세요.",
                "movel(p, vel=100, acc=100, ref=DR_BASE)",
              );
            if (motions.length >= 300) fail("모션은 최대 300개입니다.");
            let m;
            try {
              m = paths
                ? planMotion(current, to, q, v, acc, budget)
                : { from: current, to, profile: { duration: 0 } };
            } catch (e) {
              fail(
                e.message,
                "목표 위치·방향을 확인하고 가까운 점부터 실행하세요.",
              );
            }
            if (paths) {
              samples += m.samples.length;
              if (samples > 20000) fail("경로 표본은 최대 20,000개입니다.");
              q = m.endQ;
            }
            m = {
              ...m,
              index: motions.length,
              line,
              i: env.i ?? null,
              vel: v,
              acc,
            };
            motions.push(m);
            pending = { kind: "motion", motion: m.index };
            current = [...to];
            onProgress(motions.length);
            return null;
          }
        }
      }
    }
  }
  let pending = null;
  function run(nodes) {
    for (let n of nodes) {
      line = n.line;
      tick();
      if (n.k === "for") {
        let arr = list(ev(n.iter));
        for (let value of arr) {
          if (++loops > 1000) fail("총 반복 횟수는 최대 1,000회입니다.");
          env[n.name] = value;
          run(n.body);
        }
        continue;
      }
      if (n.k === "if") {
        if (ev(n.test)) run(n.body);
        else if (n.other) run(n.other);
        continue;
      }
      pending = null;
      if (n.k === "assign") {
        let v = ev(n.value);
        if (n.left.k === "name") {
          if (
            [
              "DR_BASE",
              "posx",
              "trans",
              "movel",
              "range",
              "wait",
              "tp_log",
            ].includes(n.left.v)
          )
            fail("예약된 이름에는 대입할 수 없습니다.");
          env[n.left.v] = v;
        } else {
          let a = ev(n.left.a);
          a[index(a, ev(n.left.index))] = v;
        }
      } else ev(n.value);
      events.push({
        line: n.line,
        i: env.i ?? null,
        kind: "statement",
        ...pending,
      });
      if (events.length > 5000) fail("실행 문장은 최대 5,000개입니다.");
    }
  }
  run(ast);
  const points = Array.isArray(env.pos_g)
    ? env.pos_g.filter(isPose).map((x) => [...x.values])
    : [];
  return {
    events,
    motions,
    points,
    env: JSON.parse(JSON.stringify(env)),
    duration:
      motions.reduce((s, m) => s + m.profile.duration, 0) +
      events
        .filter((e) => e.kind === "wait")
        .reduce((s, e) => s + e.duration, 0),
    metrics: { steps, iterations, samples, ms: Date.now() - start },
    initial: INITIAL,
  };
}
