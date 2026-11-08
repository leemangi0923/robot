import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Worker as NodeWorker } from "node:worker_threads";
import { JSDOM } from "jsdom";
import { EXAMPLES } from "../js/examples.js";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(f) {
  for (let i = 0; i < 500; i++) {
    if (f()) return;
    await wait(10);
  }
  throw Error("Timed out waiting for controller");
}

test("real application DOM controls, real evaluator Worker, persistence and cancellation", async (t) => {
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );
  const dom = new JSDOM(html, { url: "https://robot-lab.test/" });
  for (const key of ["window", "document", "localStorage", "Event"])
    globalThis[key] = dom.window[key];
  globalThis.devicePixelRatio = 1;
  // DOM test deliberately has no WebGL; graphics remain a separate verification limit.
  dom.window.HTMLCanvasElement.prototype.getContext = () => null;
  let raf,
    time = 0;
  globalThis.requestAnimationFrame = (fn) => {
    raf = fn;
    return 1;
  };
  globalThis.Worker = class {
    constructor(url) {
      this.thread = new NodeWorker(
        new URL("./worker-bridge.js", import.meta.url),
        { workerData: url.href },
      );
      this.thread.on("message", (data) => this.onmessage?.({ data }));
      this.thread.on("error", (err) => this.onerror?.(err));
    }
    postMessage(data) {
      this.thread.postMessage(data);
    }
    terminate() {
      this.thread.terminate();
    }
  };
  let consoleError = console.error;
  console.error = () => {};
  await import("../js/app.js");
  console.error = consoleError;
  const $ = (s) => document.querySelector(s),
    state = () => window.robotLab.state;
  const advance = (seconds) => {
    for (let n = 0; n < Math.ceil(seconds * 10); n++) {
      time += 100;
      raf(time);
    }
  };
  const edit = (code) => {
    assert.equal($("#code").readOnly, false);
    $("#code").value = code;
    $("#code").dispatchEvent(new Event("input"));
  };
  await t.test(
    "first visit prefilled sample executes and edited number changes next target",
    async () => {
      await until(() => state().plan && !state().compiling);
      advance(3);
      assert.equal(state().finished, true);
      assert.match($("#status").textContent, /완료/);
      assert.equal(state().plan.motions[0].to[0], 362.54);
      edit(EXAMPLES[0].code.replace("362.54", "342.54"));
      $("#runBtn").click();
      await until(() => state().plan && !state().compiling);
      advance(3);
      assert.equal(state().plan.motions[0].to[0], 342.54);
      assert.equal(state().finished, true);
    },
  );
  await t.test(
    "single statement stops after assignment; movel completes then stops before next statement",
    async () => {
      edit(
        "v = 100\np = posx(322.54,422.29,288.28,180,-90,0)\nmovel(p,vel=v,acc=100)\nx = 2",
      );
      $("#stepBtn").click();
      await until(() => state().plan && !state().compiling);
      advance(0.1);
      assert.equal(state().eventIndex, 1);
      assert.equal(state().playing, false);
      assert.match($("#currentLine").textContent, /1/);
      $("#stepBtn").click();
      advance(0.1);
      assert.equal(state().eventIndex, 2);
      assert.match($("#currentLine").textContent, /2/);
      $("#stepBtn").click();
      advance(2);
      assert.equal(state().eventIndex, 3);
      assert.equal(state().playing, false);
      assert.ok(
        Math.abs(state().currentQ[0] - state().plan.motions[0].endQ[0]) < 1e-8,
      );
      assert.match($("#currentLine").textContent, /3/);
      assert.match($("#targetValues").textContent, /288.28/);
    },
  );
  await t.test(
    "pause freezes playback; rate changes playback only; resume, stop and reset work",
    async () => {
      $("#pauseBtn").click();
      advance(0.1); // last assignment completes previous program
      $("#resetPoseBtn").click();
      edit("p = posx(362.54,422.29,248.28,180,-90,0)\nmovel(p,vel=10,acc=100)");
      $("#runBtn").click();
      await until(() => state().plan && !state().compiling);
      advance(0.4);
      $("#pauseBtn").click();
      let old = state().elapsed;
      advance(2);
      assert.equal(state().elapsed, old);
      let duration = state().plan.duration;
      document.querySelector('[data-speed="2"]').click();
      assert.equal(state().rate, 2);
      assert.equal(state().plan.duration, duration);
      assert.equal(state().plan.motions[0].vel, 10);
      $("#pauseBtn").click();
      advance(0.2);
      assert.ok(state().elapsed > old + 0.3);
      $("#stopBtn").click();
      assert.equal(state().plan, null);
      let q = [...state().currentQ];
      advance(2);
      assert.deepEqual(state().currentQ, q);
      $("#resetPoseBtn").click();
      assert.equal(state().plan, null);
      assert.match($("#tcpValues").textContent, /322.54/);
    },
  );
  await t.test(
    "pallet UI line, i, selected cell and target match active command",
    async () => {
      document.querySelector('[data-lesson="pallet"]').click();
      $("#runBtn").click();
      await until(() => state().plan && !state().compiling);
      advance(1);
      assert.equal(state().plan.points.length, 12);
      assert.equal(state().plan.motions.length, 36);
      let e = state().activeEvent;
      assert.equal(e.kind, "motion");
      assert.match($("#currentLine").textContent, new RegExp(String(e.line)));
      assert.equal($("#loopValue").textContent, `i = ${e.i}`);
      assert.equal(
        document.querySelector(".pallet-cell.active").dataset.cell,
        String(e.i),
      );
      assert.equal(
        $("#targetValues").textContent,
        state()
          .plan.motions[e.motion].to.slice(0, 3)
          .map((x) => x.toFixed(2))
          .join(", "),
      );
      $("#stopBtn").click();
    },
  );
  await t.test(
    "edits survive lesson switches and persisted storage is ready for reload",
    async () => {
      edit("saved_number = 731");
      await wait(350);
      let saved = JSON.parse(localStorage.getItem("robot-practice-v1"));
      assert.equal(saved.drafts.pallet, "saved_number = 731");
      document.querySelector('[data-lesson="first"]').click();
      document.querySelector('[data-lesson="pallet"]').click();
      assert.equal($("#code").value, "saved_number = 731");
      // Reload app controller in a new module instance against the retained origin storage.
      console.error = () => {};
      await import("../js/app.js?reload-check");
      console.error = consoleError;
      assert.equal($("#code").value, "saved_number = 731");
    },
  );
  await t.test(
    "excessive programs reject without blocking; stop cancels pending worker and old result",
    async () => {
      edit("for i in range(100000000):\n    x = 1");
      $("#runBtn").click();
      await until(() => !state().compiling);
      assert.match($("#status").textContent, /오류/);
      assert.match($("#console").textContent, /1,000/);
      edit(EXAMPLES.at(-1).code);
      $("#runBtn").click();
      assert.equal(state().compiling, true);
      $("#stopBtn").click();
      await wait(100);
      assert.equal(state().plan, null);
      assert.equal(state().compiling, false);
      assert.equal(state().playing, false);
    },
  );
  dom.window.close();
});
