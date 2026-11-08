import { Editor } from "./editor.js";
import { RobotScene } from "./scene.js";
import { EXAMPLES } from "./examples.js";
import { SEED, INITIAL, fk, point, progress, sampleMotion } from "./robot.js";
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
let storage = {};
try {
  storage = JSON.parse(localStorage.getItem("robot-practice-v1") || "{}");
} catch {}
let lesson = EXAMPLES.find((e) => e.id === storage.lesson) || EXAMPLES[0],
  drafts = storage.drafts || {},
  saveTimer,
  worker,
  runId = 0,
  plan = null,
  eventIndex = 0,
  activeEvent = null,
  localTime = 0,
  elapsed = 0,
  playing = false,
  stepMode = false,
  finished = false,
  rate = 1,
  currentQ = [...SEED],
  selectedCell = 0,
  logCount = 0,
  compiling = false;
const editor = new Editor((value) => {
  drafts[lesson.id] = value;
  $("#saveStatus").textContent = "저장 중…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 300);
});
let scene;
try {
  scene = new RobotScene($("#canvasHost"));
} catch (e) {
  $("#canvasHost").textContent =
    "WebGL을 시작하지 못했습니다. 하드웨어 가속을 확인하세요.";
  console.error(e);
}
function persist() {
  try {
    localStorage.setItem(
      "robot-practice-v1",
      JSON.stringify({ lesson: lesson.id, drafts }),
    );
    $("#saveStatus").textContent = "자동 저장됨";
  } catch {
    $("#saveStatus").textContent = "저장 공간 확인 필요";
  }
}
function toast(s) {
  $("#toast").textContent = s;
  $("#toast").hidden = false;
  setTimeout(() => ($("#toast").hidden = true), 3000);
}
function status(text, kind = "") {
  $("#status").textContent = text;
  $("#status").className = "status-pill " + kind;
}
function log(text, kind = "", line) {
  logCount++;
  const empty = $(".console-empty");
  empty?.remove();
  const row = document.createElement("div");
  row.className = "log-entry " + kind;
  let stamp = document.createElement("span");
  stamp.className = "stamp";
  stamp.textContent = line ? `L${line}` : "›";
  let msg = document.createElement("span");
  msg.textContent = text;
  row.append(stamp, msg);
  $("#console").append(row);
  $("#console").scrollTop = $("#console").scrollHeight;
  $("#logCount").textContent = `${logCount}개 메시지`;
  if (logCount > 200) $("#console").firstChild?.remove();
}
function logError(error) {
  log(error.message, "error", error.line);
  let hint = document.createElement("div");
  hint.className = "error-hint";
  hint.textContent = "수정 예시 · " + error.hint;
  $("#console").append(hint);
  $("#console").scrollTop = $("#console").scrollHeight;
  editor.mark(error.line);
  $("#currentLine").textContent = `오류 줄 ${error.line}`;
  status("오류", "error");
}
function buttons() {
  const active = !!plan && !finished;
  $("#pauseBtn").disabled = compiling || !active;
  $("#pauseBtn").innerHTML = playing
    ? "Ⅱ <span>일시정지</span>"
    : "▶ <span>계속</span>";
  $("#stopBtn").disabled = !compiling && !active;
  $("#stepBtn").disabled = compiling;
  $("#runBtn").disabled = compiling;
  $("#loading").hidden = !compiling;
  editor.input.readOnly = compiling || active;
}
function cancel({ reset = false, clear = true } = {}) {
  runId++;
  worker?.terminate();
  worker = null;
  compiling = false;
  playing = false;
  stepMode = false;
  activeEvent = null;
  plan = null;
  finished = false;
  eventIndex = 0;
  localTime = 0;
  elapsed = 0;
  if (reset) {
    currentQ = [...SEED];
    scene?.setQ(currentQ);
    updateTCP();
  }
  if (clear) {
    scene?.clearPlan();
    editor.mark(0);
    $("#palletPanel").hidden = true;
    $("#targetValues").textContent = "—, —, —";
    $("#loopValue").textContent = "i = —";
    $("#currentLine").textContent = "실행 줄 —";
    $("#progressBar").style.width = "0%";
    $("#motionInfo").textContent = "이동 0 / 0";
    $("#timeInfo").textContent = "0.00 / 0.00 s";
  }
  buttons();
}
function compileAndStart(single = false) {
  cancel({ reset: true });
  persist();
  status("경로 확인 중");
  compiling = true;
  buttons();
  const id = runId;
  worker = new Worker(new URL("./worker.js", import.meta.url), {
    type: "module",
  });
  worker.onmessage = ({ data }) => {
    if (data.id !== runId) return;
    worker.terminate();
    worker = null;
    compiling = false;
    if (data.error) {
      logError(data.error);
      buttons();
      return;
    }
    plan = data.result;
    finished = false;
    eventIndex = 0;
    activeEvent = null;
    elapsed = 0;
    localTime = 0;
    stepMode = single;
    playing = true;
    scene?.setPlan(plan);
    log(
      `코드 확인 완료 · ${plan.motions.length}회 이동 · 프로그램 ${plan.duration.toFixed(2)}초`,
    );
    if (plan.points.length) {
      $("#palletPanel").hidden = false;
      selectedCell = 0;
      renderPallet();
    }
    updateTimeline();
    status(single ? "한 문장 실행" : "실행 중", "running");
    buttons();
  };
  worker.onerror = () => {
    if (id !== runId) return;
    compiling = false;
    logError({
      line: 1,
      message: "실행기를 시작하지 못했습니다.",
      hint: "페이지를 새로고침하고 다시 실행하세요.",
    });
    buttons();
  };
  worker.postMessage({ id, code: editor.value });
}
function updateTCP() {
  const p = point(fk(currentQ));
  $("#tcpValues").innerHTML = [...p, 180, -90, 0]
    .map(
      (v, i) =>
        `<div class="coord-item"><label>${"XYZABC"[i]}</label><b>${v.toFixed(2)}</b></div>`,
    )
    .join("");
}
function updateTimeline() {
  if (!plan) return;
  $("#timeInfo").textContent =
    `${elapsed.toFixed(2)} / ${plan.duration.toFixed(2)} s`;
  $("#progressBar").style.width =
    `${plan.duration ? Math.min(100, (elapsed / plan.duration) * 100) : finished ? 100 : 0}%`;
  let n =
    activeEvent?.kind === "motion"
      ? activeEvent.motion + 1
      : plan.events.slice(0, eventIndex).filter((e) => e.kind === "motion")
          .length;
  $("#motionInfo").textContent = `이동 ${n} / ${plan.motions.length}`;
}
function markEvent(e) {
  editor.mark(e.line);
  $("#currentLine").textContent = `실행 줄 ${e.line}`;
  $("#loopValue").textContent = `i = ${e.i ?? "—"}`;
  if (e.kind === "motion") {
    const m = plan.motions[e.motion];
    scene?.setTarget(m.to);
    $("#targetValues").textContent = m.to
      .slice(0, 3)
      .map((x) => x.toFixed(2))
      .join(", ");
    if (e.i !== null && plan.points[e.i]) {
      selectedCell = e.i;
      renderPallet(m);
    }
  }
}
function completeEvent() {
  activeEvent = null;
  localTime = 0;
  eventIndex++;
  if (stepMode) {
    playing = false;
    stepMode = false;
    status("일시정지");
    buttons();
  }
  if (eventIndex >= plan.events.length) completeProgram();
}
function completeProgram() {
  finished = true;
  playing = false;
  activeEvent = null;
  elapsed = plan.duration;
  status("가상 실행 완료");
  log("교육용 모델에서 실행을 완료했어요.", "success");
  updateTimeline();
  buttons();
}
let previous = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - previous) / 1000);
  previous = now;
  if (playing && plan && !finished) {
    let remaining = dt * rate,
      count = 0;
    while (playing && count++ < 100) {
      if (!activeEvent) {
        if (eventIndex >= plan.events.length) {
          completeProgram();
          break;
        }
        activeEvent = plan.events[eventIndex];
        localTime = 0;
        markEvent(activeEvent);
        if (activeEvent.kind === "log")
          log(activeEvent.message, "success", activeEvent.line);
        if (activeEvent.kind === "statement" || activeEvent.kind === "log") {
          completeEvent();
          continue;
        }
      }
      let duration =
        activeEvent.kind === "motion"
          ? plan.motions[activeEvent.motion].profile.duration
          : activeEvent.duration;
      const advance = Math.min(remaining, Math.max(0, duration - localTime));
      localTime += advance;
      elapsed += advance;
      remaining -= advance;
      if (activeEvent.kind === "motion") {
        const m = plan.motions[activeEvent.motion];
        currentQ = sampleMotion(m, progress(m.profile, localTime));
        scene?.setQ(currentQ);
        updateTCP();
      }
      if (localTime >= duration - 1e-9) completeEvent();
      else break;
      if (remaining <= 0) break;
    }
    updateTimeline();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
function renderPallet(motion) {
  if (!plan?.points.length) return;
  const current =
    motion ||
    (activeEvent?.kind === "motion" &&
    plan.motions[activeEvent.motion].i === selectedCell
      ? plan.motions[activeEvent.motion]
      : null) ||
    plan.motions.find((m) => m.i === selectedCell);
  $("#palletGrid").innerHTML = plan.points
    .map(
      (_, i) =>
        `<button class="pallet-cell ${selectedCell === i ? "active" : ""} ${activeEvent?.i === i ? "playing" : ""}" data-cell="${i}" aria-label="${i}번 기준점" aria-pressed="${selectedCell === i}">${String(i).padStart(2, "0")}</button>`,
    )
    .join("");
  $$("[data-cell]").forEach(
    (b) =>
      (b.onclick = () => {
        selectedCell = Number(b.dataset.cell);
        renderPallet();
      }),
  );
  const p = plan.points[selectedCell],
    target = current?.to || p,
    d = target.slice(0, 3).map((x, i) => x - p[i]);
  let origin =
    selectedCell === 0
      ? "직접 지정"
      : selectedCell % 4 === 0
        ? `i−4 = ${selectedCell - 4}에서 다음 줄`
        : `i−1 = ${selectedCell - 1}에서 다음 칸`;
  $("#equation").innerHTML =
    `<div class="eq-part"><small>${selectedCell}번 기준 XYZ</small><code>${p
      .slice(0, 3)
      .map((x) => x.toFixed(3))
      .join(
        "<br>",
      )}</code><b>${origin}</b></div><span class="eq-sign">＋</span><div class="eq-part"><small>변화량 XYZ</small><code>${d.map((x) => (x >= 0 ? "+" : "") + x.toFixed(3)).join("<br>")}</code><b>mm · 베이스 기준</b></div><span class="eq-sign">→</span><div class="eq-part"><small>TCP 목표 XYZ</small><code>${target
      .slice(0, 3)
      .map((x) => x.toFixed(3))
      .join(
        "<br>",
      )}</code><b>${current ? `이동 ${current.index + 1} · 줄 ${current.line}` : "계산된 기준점"}</b></div>`;
}
function renderLessons() {
  $("#lessonStrip").innerHTML = EXAMPLES.slice(0, 6)
    .map(
      (e, i) =>
        `<button class="lesson-step ${lesson.id === e.id ? "active" : ""}" data-lesson="${e.id}"><span class="step-no">${String(i + 1).padStart(2, "0")}</span><span class="step-text">${e.title}</span>${i < 5 ? '<span class="step-arrow">›</span>' : ""}</button>`,
    )
    .join("");
  $$("[data-lesson]").forEach(
    (b) => (b.onclick = () => switchLesson(b.dataset.lesson)),
  );
  $("#examplesList").innerHTML = EXAMPLES.map(
    (e, i) =>
      `<button class="example-choice" data-choice="${e.id}"><span>${String(i + 1).padStart(2, "0")}</span><div><strong>${e.title}</strong><small>${e.desc}</small></div><em>${e.tag}</em></button>`,
  ).join("");
  $$("[data-choice]").forEach(
    (b) =>
      (b.onclick = () => {
        switchLesson(b.dataset.choice);
        $("#examplesDialog").close();
      }),
  );
  $("#lessonCount").textContent =
    `LESSON ${String(EXAMPLES.indexOf(lesson) + 1).padStart(2, "0")}`;
  $("#lessonTitle").textContent = lesson.title;
  $("#lessonDesc").textContent = lesson.desc;
  $("#insightTitle").textContent =
    lesson.id === "first" ? "첫 번째 실험" : lesson.title + " · 관찰 포인트";
  const hints = {
    first:
      "6번 줄의 X 좌표를 362.54에서 342.54로 바꾸면, 목표점은 어디로 움직일까요?",
    trans:
      "trans는 원본 p를 바꾸지 않아요. Z 변화량을 40에서 20으로 바꿔 비교해 보세요.",
    speed:
      "v를 10에서 100으로 바꾸고 프로그램 시간을 비교하세요. 재생 배율은 코드의 속도를 바꾸지 않아요.",
    loop: "points[i]는 좌표 한 개예요. 리스트 전체와 한 점의 차이를 확인하세요.",
    grid: "i = 4, 8에서는 i−4에서 다음 줄을 시작해요. 칸 번호를 눌러 좌표를 살펴보세요.",
    pallet:
      "각 칸에서 기준 Z+20 → Z+10 → Z+20 mm. 줄바꿈 구간도 코드대로 직선 이동합니다.",
    original:
      "한 줄 조건식은 선택된 분기만 평가합니다. 0~11번의 기준점과 36회 이동을 확인하세요.",
  };
  $("#insightText").textContent = hints[lesson.id];
}
function switchLesson(id) {
  drafts[lesson.id] = editor.value;
  cancel({ reset: true });
  lesson = EXAMPLES.find((e) => e.id === id);
  editor.value = drafts[id] ?? lesson.code;
  renderLessons();
  persist();
  status("준비");
  toast("작성 중인 코드를 보관하고 예제를 열었어요.");
}
editor.value = drafts[lesson.id] ?? lesson.code;
renderLessons();
updateTCP();
buttons();
$("#runBtn").onclick = () => compileAndStart(false);
$("#pauseBtn").onclick = () => {
  if (!plan || finished) return;
  playing = !playing;
  stepMode = false;
  status(playing ? "실행 중" : "일시정지", playing ? "running" : "");
  buttons();
};
$("#stepBtn").onclick = () => {
  if (!plan || finished) {
    compileAndStart(true);
    return;
  }
  playing = true;
  stepMode = true;
  status("한 문장 실행", "running");
  buttons();
};
$("#stopBtn").onclick = () => {
  cancel({ clear: false });
  editor.mark(0);
  scene?.setTarget(null);
  status("정지");
  log("실행을 정지했어요. 현재 자세를 유지합니다.");
};
$("#resetPoseBtn").onclick = () => {
  cancel({ reset: true });
  status("준비");
  log("시작 자세로 돌아왔어요.");
};
$("#viewReset").onclick = () => scene?.resetView();
$$("[data-speed]").forEach(
  (b) =>
    (b.onclick = () => {
      rate = Number(b.dataset.speed);
      $$("[data-speed]").forEach((x) =>
        x.classList.toggle("selected", x === b),
      );
    }),
);
const openHelp = () => $("#helpDialog").showModal();
["#helpBtn", "#guideNav", "#modelInfoBtn"].forEach(
  (s) => ($(s).onclick = openHelp),
);
$("#practiceNav").onclick = () => {
  $("#codeSide").scrollIntoView({ behavior: "smooth", block: "center" });
};
$("#exampleBtn").onclick = () => $("#examplesDialog").showModal();
$$(".close-dialog").forEach(
  (b) => (b.onclick = () => b.closest("dialog").close()),
);
$$("dialog").forEach((d) =>
  d.addEventListener("click", (e) => {
    if (e.target === d) {
      let r = d.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        d.close();
    }
  }),
);
$("#insightAction").onclick = () => {
  setTab("code");
  editor.input.focus();
};
$("#clearLogBtn").onclick = () => {
  $("#console").replaceChildren();
  logCount = 0;
  $("#logCount").textContent = "0개 메시지";
};
function setTab(name) {
  $$("[data-tab]").forEach((x) =>
    x.classList.toggle("selected", x.dataset.tab === name),
  );
  $(".workspace").classList.toggle("show-scene", name === "scene");
  requestAnimationFrame(() => scene?.resize());
}
$$("[data-tab]").forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
$("#importBtn").onclick = () => $("#fileInput").click();
$("#fileInput").onchange = async (e) => {
  let file = e.target.files[0];
  if (!file) return;
  if (file.size > 60000) {
    toast("파일은 60KB 이하로 선택해 주세요.");
    return;
  }
  cancel({ reset: true });
  editor.value = await file.text();
  drafts[lesson.id] = editor.value;
  persist();
  status("준비");
  toast("파일을 가져왔어요.");
  e.target.value = "";
};
$("#exportBtn").onclick = () => {
  const url = URL.createObjectURL(
      new Blob([editor.value], { type: "text/plain;charset=utf-8" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = `robot-practice-${lesson.id}.drl`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("현재 코드를 내보냈어요.");
};
$("#restoreBtn").onclick = () => {
  const backup = editor.value;
  cancel({ reset: true });
  drafts[lesson.id + "-backup"] = backup;
  editor.value = lesson.code;
  drafts[lesson.id] = editor.value;
  persist();
  toast("예제 원본을 복원했어요. 이전 코드는 브라우저 백업에 보관했어요.");
};
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    compileAndStart(false);
  }
});
window.addEventListener("beforeunload", () => {
  drafts[lesson.id] = editor.value;
  persist();
});
// First visit: execute the prefilled, short example once. Returning drafts stay editable.
if (!storage.lesson) setTimeout(() => compileAndStart(false), 650);
// Read-only diagnostics used by the browser acceptance checks.
window.robotLab = {
  get state() {
    return {
      lesson: lesson.id,
      playing,
      compiling,
      finished,
      eventIndex,
      activeEvent,
      elapsed,
      rate,
      currentQ,
      plan,
    };
  },
};
