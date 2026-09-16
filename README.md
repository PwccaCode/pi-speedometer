# pi-speedometer

Live output tok/s and TTFT in the [pi](https://pi.dev) footer, refreshed every 200ms.

`27.1 tok/s · ttft 1.2s`

- **tok/s** — sliding 3s window of output tokens (real usage when the provider reports
  it mid-stream, `chars/4` otherwise), then the exact average for the whole message once
  it ends.
- **ttft** — time from the provider request to the first token. Counts up live while the
  model is thinking, then freezes.
- The last number stays on screen across tool calls: while a tool runs, or while the next
  request is in flight, you see the previous speed next to the live TTFT counter.

## Install

```bash
pi install git:github.com/PwccaCode/pi-speedometer
```

Try it without installing:

```bash
pi -e git:github.com/PwccaCode/pi-speedometer
```

From a clone:

```bash
pi -e ./.pi/extensions/pi-speedometer.ts
```

Toggle with `/speed`.
