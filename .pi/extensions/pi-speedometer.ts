// pi-speedometer — live output tok/s in the footer, refreshed every 200ms.
// Test: pi -e ./.pi/extensions/pi-speedometer.ts
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const WINDOW_MS = 3000; // sliding window for the live number
const TICK_MS = 200;

export default function (pi: ExtensionAPI) {
  let enabled = true;
  let start = 0;
  let ctx: ExtensionContext | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let samples: Array<{ t: number; n: number }> = [];
  let chars = 0;
  let reported = 0; // cumulative output tokens seen so far (0 if provider never reports mid-stream)

  function render() {
    if (!enabled || !ctx || !start) return;
    const now = Date.now();
    while (samples.length && now - samples[0]!.t > WINDOW_MS) samples.shift();

    const tokens = samples.reduce((sum, s) => sum + s.n, 0);
    const span = samples.length ? now - samples[0]!.t : now - start;
    if (span < 400 || tokens <= 0) return; // too early to mean anything
    ctx.ui.setStatus("speed", `${(tokens / (span / 1000)).toFixed(1)} tok/s`);
  }

  function stop(ctx: ExtensionContext) {
    if (timer) clearInterval(timer);
    timer = undefined;
    samples = [];
    chars = 0;
    reported = 0;
    start = 0;
    ctx.ui.setStatus("speed", undefined);
  }

  pi.on("message_start", async (event, ctx0) => {
    if (event.message.role !== "assistant") return;
    ctx = ctx0;
    stop(ctx0);
    start = Date.now();
    ctx0.ui.setStatus("speed", "0.0 tok/s");
    timer = setInterval(render, TICK_MS);
    if (typeof timer === "object" && "unref" in timer) timer.unref();
  });

  pi.on("message_update", async (event) => {
    if (!enabled || !start) return;
    const e = event.assistantMessageEvent;
    if (e.type !== "text_delta" && e.type !== "thinking_delta" && e.type !== "toolcall_delta") return;

    chars += e.delta.length;
    let delta: number;
    const usage = e.partial.usage?.output ?? 0;
    if (usage > 0) {
      delta = usage - reported; // provider reports cumulative output tokens
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
    const secs = start ? (Date.now() - start) / 1000 : 0;
    const output = usage?.output ?? 0;
    stop(ctx0);
    if (enabled && output > 0 && secs > 0) {
      ctx0.ui.setStatus("speed", `${(output / secs).toFixed(1)} tok/s  (${output} tok, ${secs.toFixed(1)}s)`);
    }
  });

  pi.registerCommand("speed", {
    description: "Toggle the tok/s speedometer",
    handler: async (_args, ctx0) => {
      enabled = !enabled;
      ctx = ctx0;
      if (!enabled) stop(ctx0);
      ctx0.ui.notify(`speedometer ${enabled ? "on" : "off"}`, "info");
    },
  });
}
