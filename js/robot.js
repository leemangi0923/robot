// Official M0609 URDF origins, in mm; rotations are radians. No tool0 rotation.
export const ORIGINS = [
  [
    [0, 0, 134.5],
    [0, 0, 0],
  ],
  [
    [0, 6.2, 0],
    [0, -1.571, -1.571],
  ],
  [
    [411, 0, 0],
    [0, 0, 1.571],
  ],
  [
    [0, -368, 0],
    [1.571, 0, 0],
  ],
  [
    [0, 0, 0],
    [-1.571, 0, 0],
  ],
  [
    [0, -121, 0],
    [1.571, 0, 0],
  ],
];
export const LIMITS = [6.2832, 6.2832, 2.618, 6.2832, 6.2832, 6.2832];
export const SEED = [
  63.7367, 25.6613, 102.347, -106.8982, 69.5716, -48.8997,
].map((x) => (x * Math.PI) / 180);
export const INITIAL = [322.54, 422.29, 278.28, 180, -90, 0];
export const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export function mul(a, b) {
  const c = Array(16).fill(0);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      for (let k = 0; k < 4; k++) c[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
  return c;
}
export function rot(axis, t) {
  let c = Math.cos(t),
    s = Math.sin(t);
  return axis === 0
    ? [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1]
    : axis === 1
      ? [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1]
      : [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}
export function frame(p, r) {
  let m = mul(mul(rot(2, r[2]), rot(1, r[1])), rot(0, r[0]));
  m[3] = p[0];
  m[7] = p[1];
  m[11] = p[2];
  return m;
}
export const point = (m) => [m[3], m[7], m[11]];
export const norm = (a) => Math.hypot(...a);
export const sub = (a, b) => a.map((v, i) => v - b[i]);
export const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
export function poseMatrix(p) {
  let m = mul(
    mul(rot(2, (p[3] * Math.PI) / 180), rot(1, (p[4] * Math.PI) / 180)),
    rot(2, (p[5] * Math.PI) / 180),
  );
  m[3] = p[0];
  m[7] = p[1];
  m[11] = p[2];
  return m;
}
export function fk(q, chain = false) {
  let m = identity(),
    frames = [];
  for (let i = 0; i < 6; i++) {
    m = mul(m, frame(...ORIGINS[i]));
    m = mul(m, rot(2, q[i]));
    frames.push(m);
  }
  return chain ? frames : m;
}
function angular(a, b) {
  let v = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    v[0] += (a[4 + c] * b[8 + c] - a[8 + c] * b[4 + c]) / 2;
    v[1] += (a[8 + c] * b[c] - a[c] * b[8 + c]) / 2;
    v[2] += (a[c] * b[4 + c] - a[4 + c] * b[c]) / 2;
  }
  return v;
}
export function errors(m, target) {
  let trace = 0;
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) trace += m[r * 4 + c] * target[r * 4 + c];
  return {
    position: norm(sub(point(target), point(m))),
    angle: Math.acos(Math.min(1, Math.max(-1, (trace - 1) / 2))),
  };
}
function solve(a, b) {
  a = a.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < 6; i++) {
    let p = i;
    for (let j = i + 1; j < 6; j++)
      if (Math.abs(a[j][i]) > Math.abs(a[p][i])) p = j;
    [a[i], a[p]] = [a[p], a[i]];
    if (Math.abs(a[i][i]) < 1e-12) return null;
    let d = a[i][i];
    for (let k = i; k <= 6; k++) a[i][k] /= d;
    for (let j = 0; j < 6; j++)
      if (i !== j) {
        d = a[j][i];
        for (let k = i; k <= 6; k++) a[j][k] -= d * a[i][k];
      }
  }
  return a.map((r) => r[6]);
}
export function ik(target, seed, budget = () => {}) {
  let q = [...seed];
  for (let n = 0; n < 70; n++) {
    budget();
    let m = fk(q),
      e = errors(m, target);
    if (e.position < 0.004 && e.angle < 0.00004) return q;
    let err = [
      ...sub(point(target), point(m)),
      ...angular(m, target).map((x) => x * 200),
    ];
    let j = Array.from({ length: 6 }, () => Array(6));
    for (let c = 0; c < 6; c++) {
      let t = [...q];
      t[c] += 1e-5;
      let f = fk(t),
        d = [...sub(point(f), point(m)), ...angular(m, f).map((x) => x * 200)];
      for (let r = 0; r < 6; r++) j[r][c] = d[r] / 1e-5;
    }
    let a = Array.from({ length: 6 }, (_, r) =>
        Array.from({ length: 6 }, (_, c) =>
          j.reduce((s, row) => s + row[r] * row[c], r === c ? 0.02 : 0),
        ),
      ),
      b = Array.from({ length: 6 }, (_, c) =>
        j.reduce((s, row, r) => s + row[c] * err[r], 0),
      ),
      dq = solve(a, b);
    if (!dq) return null;
    let scale = Math.min(1, 0.18 / Math.max(...dq.map(Math.abs)));
    for (let k = 0; k < 6; k++) {
      q[k] += dq[k] * scale;
      if (Math.abs(q[k]) > LIMITS[k]) return null;
    }
  }
  return null;
}
export function profile(distance, vel, acc) {
  let peak = Math.min(vel, Math.sqrt(distance * acc)),
    ramp = peak / acc,
    cruise = peak ? Math.max(0, (distance - (peak * peak) / acc) / peak) : 0;
  return {
    distance,
    vel,
    acc,
    peak,
    ramp,
    cruise,
    duration: 2 * ramp + cruise,
  };
}
export function progress(p, t) {
  if (!p.distance) return 1;
  t = Math.max(0, Math.min(t, p.duration));
  let d =
    t < p.ramp
      ? 0.5 * p.acc * t * t
      : t < p.ramp + p.cruise
        ? 0.5 * p.acc * p.ramp * p.ramp + p.peak * (t - p.ramp)
        : p.distance - 0.5 * p.acc * (p.duration - t) ** 2;
  return Math.min(1, d / p.distance);
}
export function planMotion(from, to, seed, vel, acc, budget = () => {}) {
  const target = poseMatrix(to),
    start = poseMatrix(from);
  if (errors(start, target).angle > 0.0001)
    throw Error(
      "첫 버전은 TCP 방향이 유지되는 movel만 지원합니다. ABC를 현재 자세와 같게 쓰세요.",
    );
  let distance = norm(sub(to.slice(0, 3), from.slice(0, 3))),
    samples = [{ s: 0, q: seed }],
    q = seed;
  const at = (s) => {
    let m = [...target],
      p = lerp(from, to, s);
    m[3] = p[0];
    m[7] = p[1];
    m[11] = p[2];
    return m;
  };
  function segment(s0, q0, s1, depth) {
    budget();
    const q1 = ik(at(s1), q0, budget);
    if (!q1) throw Error("교육용 모델에서 경로 해를 찾지 못함");
    let good = Math.max(...sub(q1, q0).map(Math.abs)) <= 0.025;
    for (const f of [0.25, 0.5, 0.75]) {
      let e = errors(fk(lerp(q0, q1, f)), at(s0 + (s1 - s0) * f));
      good = good && e.position <= 0.05 && e.angle <= 0.0005;
    }
    if (!good) {
      if (depth >= 12) throw Error("교육용 모델에서 경로 해를 찾지 못함");
      let mid = (s0 + s1) / 2,
        qm = segment(s0, q0, mid, depth + 1);
      return segment(mid, qm, s1, depth + 1);
    }
    samples.push({ s: s1, q: q1 });
    return q1;
  }
  let count = Math.max(1, Math.ceil(distance / 2));
  for (let n = 1; n <= count; n++)
    q = segment((n - 1) / count, q, n / count, 0);
  return { samples, profile: profile(distance, vel, acc), endQ: q, from, to };
}
export function sampleMotion(m, s) {
  let a = 0,
    b = m.samples.length - 1;
  while (b - a > 1) {
    let c = (a + b) >> 1;
    if (m.samples[c].s < s) a = c;
    else b = c;
  }
  let l = m.samples[a],
    r = m.samples[b];
  return lerp(l.q, r.q, (s - l.s) / (r.s - l.s || 1));
}
