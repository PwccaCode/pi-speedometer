// Test: pi -e ./.pi/extensions/pi-speedometer.ts
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const WINDOW_MS = 3000;
const TICK_MS = 200;

export default function (pi: ExtensionAPI) {
  let enabled = true;
  let ctx: ExtensionContext | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let samples: Array<{ t: number; n: number }> = [];
  let chars = 0;
  let reported = 0;
  let start = 0;
  let requestAt = 0;
  let ttft: number | undefined;
  let prevSpeed = "";

  const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
  const waitingLine = () => [prevSpeed, `ttft ${secs(Date.now() - requestAt)}`].filter(Boolean).join(" · ");

  function render() {
    if (!enabled || !ctx || !requestAt) return;
    const now = Date.now();
    if (ttft === undefined) {
      ctx.ui.setStatus("speed", waitingLine());
      return;
    }
    while (samples.length && now - samples[0]!.t > WINDOW_MS) samples.shift();

    const tokens = samples.reduce((sum, s) => sum + s.n, 0);
    if (samples.length < 2 || tokens <= 0) return;
    const span = Math.max(now - samples[0]!.t, TICK_MS);
    prevSpeed = `${(tokens / (span / 1000)).toFixed(1)} tok/s`;
    ctx.ui.setStatus("speed", `${prevSpeed} · ttft ${secs(ttft)}`);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = undefined;
    samples = [];
    chars = 0;
    reported = 0;
    start = 0;
    requestAt = 0;
    ttft = undefined;
  }

  function tick(ctx0?: ExtensionContext) {
    if (ctx0) ctx = ctx0;
    if (timer) return;
    timer = setInterval(render, TICK_MS);
    if (typeof timer === "object" && "unref" in timer) timer.unref();
  }

  pi.on("before_provider_request", async (_event, ctx0) => {
    if (!enabled) return;
    stop();
    requestAt = Date.now();
    tick(ctx0);
  });

  pi.on("message_start", async (event, ctx0) => {
    if (event.message.role !== "assistant") return;
    ctx = ctx0;
    if (!enabled) return;
    start = Date.now();
    samples = [];
    chars = 0;
    reported = 0;
    tick(ctx0);
  });

  pi.on("message_update", async (event) => {
    if (!enabled || !requestAt) return;
    const e = event.assistantMessageEvent;
    if (e.type !== "text_delta" && e.type !== "thinking_delta" && e.type !== "toolcall_delta") return;
    if (ttft === undefined) ttft = Date.now() - requestAt;

    chars += e.delta.length;
    let delta: number;
    const usage = e.partial.usage?.output ?? 0;
    if (usage > 0) {
      delta = usage - reported;
      reported = usage;
    } else {
      delta = chars / 4 - reported; // ponytail: chars/4 estimate until real usage arrives
      reported += delta;
    }
    if (delta > 0) samples.push({ t: Date.now(), n: delta });
  });

  pi.on("message_end", async (event, ctx0) => {
    if (event.message.role !== "assistant") return;
    const usage = event.message.usage;
    const secs_ = start ? (Date.now() - start) / 1000 : 0;
    const output = usage?.output ?? 0;
    const seenTtft = ttft;
    stop();
    if (enabled && output > 0 && secs_ > 0) {
      prevSpeed = `${(output / secs_).toFixed(1)} tok/s  (${output} tok, ${secs_.toFixed(1)}s)`;
      ctx0.ui.setStatus("speed", seenTtft === undefined ? prevSpeed : `${prevSpeed} · ttft ${secs(seenTtft)}`);
    }
  });

  pi.registerCommand("speed", {
    description: "Toggle the tok/s speedometer",
    handler: async (_args, ctx0) => {
      enabled = !enabled;
      ctx = ctx0;
      if (!enabled) {
        stop();
        prevSpeed = "";
        ctx0.ui.setStatus("speed", undefined);
      }
      ctx0.ui.notify(`speedometer ${enabled ? "on" : "off"}`, "info");
    },
  });
}
