import test from "node:test";
import assert from "node:assert/strict";
import { compile } from "../js/runtime.js";
import { PALLET, EXAMPLES } from "../js/examples.js";
import {
  fk,
  SEED,
  INITIAL,
  poseMatrix,
  point,
  errors,
  lerp,
  profile,
  progress,
  sampleMotion,
  LIMITS,
} from "../js/robot.js";
const close = (a, b, t = 1e-6) => assert.ok(Math.abs(a - b) < t, `${a} ≠ ${b}`);
const p = "posx(322.54, 422.29, 278.28, 180, -90, 0)";
let pallet = compile(PALLET);
test("all seven editable examples compile with validated paths", () => {
  for (const e of EXAMPLES) {
    let r = compile(e.code);
    assert.ok(r.events.length > 0);
  }
});
test("URDF initial joint candidate matches given TCP and ZYZ orientation", () => {
  let e = errors(fk(SEED), poseMatrix(INITIAL));
  assert.ok(e.position < 0.001);
  assert.ok(e.angle < 1e-6);
});
test("unedited pallet: 12 reference points, 36 motions, expected coordinates and heights", () => {
  assert.equal(pallet.points.length, 12);
  assert.equal(pallet.motions.length, 36);
  [363.37, 462.39, 228.68].forEach((v, i) => close(pallet.points[4][i], v));
  [364.2, 502.49, 229.08].forEach((v, i) => close(pallet.points[8][i], v));
  assert.deepEqual(
    pallet.motions.slice(0, 3).map((x) => x.to[2]),
    [248.28, 238.28, 248.28],
  );
});
test("row changes 3→4 and 7→8 remain a single direct movel with no added waypoint", () => {
  for (let i of [4, 8]) {
    let m = pallet.motions[i * 3];
    assert.deepEqual(m.from, pallet.motions[i * 3 - 1].to);
    assert.deepEqual(
      m.to.slice(0, 3),
      pallet.points[i].slice(0, 3).map((v, j) => v + (j === 2 ? 20 : 0)),
    );
  }
  assert.equal(pallet.motions.length, 36);
});
test("all planned samples and dense joint interpolations satisfy FK and joint limits", () => {
  for (const m of pallet.motions) {
    for (let n = 0; n < m.samples.length - 1; n++) {
      const a = m.samples[n],
        b = m.samples[n + 1];
      assert.ok(
        Math.max(...b.q.map((v, i) => Math.abs(v - a.q[i]))) <= 0.025 + 1e-10,
      );
      for (let k = 0; k <= 10; k++) {
        let f = k / 10,
          q = lerp(a.q, b.q, f),
          s = a.s + (b.s - a.s) * f,
          target = poseMatrix(lerp(m.from, m.to, s)),
          e = errors(fk(q), target);
        assert.ok(e.position <= 0.05);
        assert.ok(e.angle <= 0.0005);
        q.forEach((v, i) => assert.ok(Math.abs(v) <= LIMITS[i]));
      }
    }
  }
});
test("trans returns new poses, preserves source and list aliases", () => {
  let r = compile(
    `p = ${p}\na = trans(p, [0,0,10,0,0,0])\nb = trans(p, [0,0,10,0,0,0])\nitems = [p] * 2\nitems[0] = trans(items[0], [0,0,20,0,0,0])`,
  );
  close(r.env.p.values[2], 278.28);
  close(r.env.a.values[2], 288.28);
  close(r.env.b.values[2], 288.28);
  close(r.env.items[1].values[2], 278.28);
});
test("lazy conditional never evaluates unchosen invalid index or undefined name", () => {
  let r = compile(
    "x = [4]\na = x[0] if 1 == 1 else x[99]\nb = unknown if 0 else 8",
  );
  assert.equal(r.env.a, 4);
  assert.equal(r.env.b, 8);
});
test("arithmetic, Python floor and modulo, lists, indexes and loops", () => {
  const r = compile(
    "a = -7 // 3\nb = -7 % 3\nc = (2 + 3) * 4 / 2\nx = [0] * 3\nfor i in range(3):\n    x[i] = i + 1\ny = 0\nfor value in x:\n    y = y + value\nz = x[-1]",
  );
  assert.equal(r.env.a, -3);
  assert.equal(r.env.b, 2);
  assert.equal(r.env.c, 10);
  assert.equal(r.env.y, 6);
  assert.equal(r.env.z, 3);
  let chain = compile("a = 1 < 2 <= 3\nb = 1 > 2 < unknown");
  assert.equal(chain.env.a, true);
  assert.equal(chain.env.b, false);
});
test("errors include line, reason and repair hint for indices and entire pose lists", () => {
  assert.throws(
    () => compile("x = [1]\ny = x[3]"),
    (e) => e.line === 2 && /인덱스/.test(e.message) && !!e.hint,
  );
  assert.throws(
    () => compile(`pos_g = [${p}]\nmovel(pos_g, vel=100, acc=100)`),
    (e) =>
      e.line === 2 &&
      e.message === "pos_g는 좌표 목록입니다. 한 점은 pos_g[0]처럼 선택하세요.",
  );
});
test("wait comma error, invalid delta, undefined variable, brackets and indentation", () => {
  for (const [code, pattern] of [
    ["wait(1, 0)", /초 단위 숫자 하나/],
    [`trans(${p}, [0,0])`, /delta/],
    ["x = unknown", /정의되지/],
    ["x = [1,2", /필요/],
    ["x = 1\n    y = 2", /들여쓰기/],
  ])
    assert.throws(() => compile(code), pattern);
});
test("unsupported motion inputs, frames and rotation deltas are rejected", () => {
  for (const code of [
    `movel(${p}, vel=[10,10], acc=100)`,
    `movel(${p}, vel=0, acc=100)`,
    `movel(${p}, vel=100, acc=-1)`,
    `movel(${p}, vel=100, acc=100, time=2)`,
    `movel(${p}, vel=100, acc=100, ref=1)`,
    `trans(${p}, [0,0,0,1,0,0])`,
  ])
    assert.throws(() => compile(code));
});
test("unsupported syntax and excessive resource use reject without execution", () => {
  for (const code of [
    "while 1:\n    x = 1",
    "import os",
    "x = [0] * 100000000",
    "x = [] * 100000000",
    "for i in range(100000000):\n    x = 1",
    "for i in range(1000):\n    for j in range(1000):\n        x = 1",
  ])
    assert.throws(() => compile(code));
});
test("unreachable path fails before any playback plan can be returned, with command line", () => {
  assert.throws(
    () =>
      compile(
        "p = posx(10000, 0, 278.28, 180, -90, 0)\nmovel(p, vel=100, acc=100)",
      ),
    (e) =>
      e.line === 2 && /교육용 모델에서 경로 해를 찾지 못함/.test(e.message),
  );
});
test("10mm timing: vel 10 versus 100, different acceleration, playback rate stays separate", () => {
  let slow = profile(10, 10, 100),
    fast = profile(10, 100, 100),
    accel = profile(10, 100, 400);
  close(slow.duration, 1.1);
  close(fast.duration, 2 * Math.sqrt(0.1));
  close(accel.duration, 2 * Math.sqrt(0.025));
  assert.ok(fast.peak < 100);
  assert.ok(slow.duration > fast.duration);
  assert.ok(accel.duration < fast.duration);
  close(fast.duration / 2, Math.sqrt(0.1));
  close(fast.vel, 100);
  close(fast.acc, 100);
  close(progress(fast, 0), 0);
  close(progress(fast, fast.duration), 1);
  let r = compile(
    `p = ${p}\nq = trans(p,[0,0,10,0,0,0])\nmovel(q,vel=10,acc=100)`,
  );
  close(r.duration, 1.1);
});
test("events preserve assignment stops and matching motion line, loop index, target", () => {
  const r = compile(
    `v = 100\nfor i in range(2):\n    p = posx(322.54,422.29,278.28 + i*10,180,-90,0)\n    movel(p,vel=v,acc=100)`,
  );
  assert.equal(r.events[0].kind, "statement");
  assert.equal(r.events[0].line, 1);
  assert.deepEqual(
    r.events.map((x) => x.kind),
    ["statement", "statement", "motion", "statement", "motion"],
  );
  for (const e of r.events.filter((x) => x.kind === "motion")) {
    let m = r.motions[e.motion];
    assert.equal(m.line, e.line);
    assert.equal(m.i, e.i);
    close(m.to[2], 278.28 + e.i * 10);
  }
});
