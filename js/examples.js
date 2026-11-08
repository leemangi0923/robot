export const PALLET = `v = 100
a = 100

pos_g = [posx(362.54, 422.29, 228.28, 180, -90, 0)] * 12

for i in range(1, 12):
    pos_g[i] = trans(pos_g[i-4], [0.83, 40.1, 0.4, 0, 0, 0]) if i % 4 == 0 else trans(pos_g[i-1], [-40.0, -0.016667, -0.166667, 0, 0, 0])

for i in range(12):
    movel(trans(pos_g[i], [0, 0, 20, 0, 0, 0]), vel=v, acc=a)
    movel(trans(pos_g[i], [0, 0, 10, 0, 0, 0]), vel=v, acc=a)
    movel(trans(pos_g[i], [0, 0, 20, 0, 0, 0]), vel=v, acc=a)`;
const base = `pos_g = [posx(362.54, 422.29, 228.28, 180, -90, 0)] * 12

for i in range(1, 12):
    if i % 4 == 0:
        pos_g[i] = trans(pos_g[i-4], [0.83, 40.1, 0.4, 0, 0, 0], ref=DR_BASE)
    else:
        pos_g[i] = trans(pos_g[i-1], [-40, -0.016667, -0.166667, 0, 0, 0], ref=DR_BASE)`;
export const EXAMPLES = [
  {
    id: "first",
    title: "한 점으로 직선 이동",
    tag: "시작하기",
    desc: "숫자 하나가 로봇의 움직임이 됩니다.",
    code: `# 첫 번째 움직임을 만들어 보세요.
# X, Y, Z의 단위는 mm입니다.
v = 100
a = 100

p = posx(362.54, 422.29, 248.28, 180, -90, 0)

# 목표점까지 직선으로 이동합니다.
movel(p, vel=v, acc=a, ref=DR_BASE)
tp_log("첫 번째 이동을 완료했어요!")`,
  },
  {
    id: "trans",
    title: "trans로 Z 올리기",
    tag: "좌표",
    desc: "원본 자세는 유지하고, 새로운 목표점을 만들어요.",
    code: `p = posx(362.54, 422.29, 248.28, 180, -90, 0)
movel(p, vel=100, acc=100, ref=DR_BASE)

# Z만 40 mm 올립니다.
up = trans(p, [0, 0, 40, 0, 0, 0], ref=DR_BASE)
movel(up, vel=100, acc=100, ref=DR_BASE)`,
  },
  {
    id: "speed",
    title: "속도·가속도 비교",
    tag: "시간",
    desc: "짧은 구간에서는 설정 속도에 도달하지 않을 수 있어요.",
    code: `p = posx(322.54, 422.29, 278.28, 180, -90, 0)
q = trans(p, [0, 0, 10, 0, 0, 0], ref=DR_BASE)
# v = 10과 100의 프로그램 시간을 비교하세요.
v = 10
a = 100
movel(q, vel=v, acc=a, ref=DR_BASE)
movel(p, vel=v, acc=a, ref=DR_BASE)`,
  },
  {
    id: "loop",
    title: "반복문으로 점 순회",
    tag: "반복",
    desc: "리스트에서 한 점씩 선택해 움직여 보세요.",
    code: `p = posx(362.54, 422.29, 248.28, 180, -90, 0)
points = [p, trans(p, [-40, 0, 0, 0, 0, 0], ref=DR_BASE), trans(p, [-80, 0, 0, 0, 0, 0], ref=DR_BASE)]
for i in range(3):
    movel(points[i], vel=100, acc=100, ref=DR_BASE)`,
  },
  {
    id: "grid",
    title: "파레트 점 계산",
    tag: "4 × 3",
    desc: "i−4와 i−1의 차이로 12개의 기준점을 만들어요.",
    code: base + '\n\ntp_log("12개 기준점 계산 완료")',
  },
  {
    id: "pallet",
    title: "12칸 높이 왕복",
    tag: "도전",
    desc: "기준점 위 20 → 10 → 20 mm. 총 36번 이동해요.",
    code:
      "v = 100\na = 100\n\n" +
      base +
      `\n\nfor i in range(12):
    movel(trans(pos_g[i], [0, 0, 20, 0, 0, 0], ref=DR_BASE), vel=v, acc=a, ref=DR_BASE)
    movel(trans(pos_g[i], [0, 0, 10, 0, 0, 0], ref=DR_BASE), vel=v, acc=a, ref=DR_BASE)
    movel(trans(pos_g[i], [0, 0, 20, 0, 0, 0], ref=DR_BASE), vel=v, acc=a, ref=DR_BASE)`,
  },
  {
    id: "original",
    title: "파레트 원문 예제",
    tag: "DRL",
    desc: "요청하신 한 줄 조건식 예제를 그대로 실행합니다.",
    code: PALLET,
  },
];
