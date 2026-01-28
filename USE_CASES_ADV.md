# log-sm · Advanced Use Cases

> Deeper patterns you may need in production environments.  
> These extend the cookbook in **USE_CASES.md** without adding complexity to the core.

---

## Table of Contents

15. [FATAL patterns (without a FATAL level)](#15-fatal-patterns-without-a-fatal-level)
16. [Filter / silence by message pattern](#16-filter--silence-by-message-pattern)
17. [Console grouping / nested views (browser devtools)](#17-console-grouping--nested-views-browser-devtools)
18. [Capture unhandled rejections & uncaught exceptions](#18-capture-unhandled-rejections--uncaught-exceptions)
19. [Remote DEBUG toggle via env / signal](#19-remote-debug-toggle-via-env--signal)
20. [Structured performance / timing logs](#20-structured-performance--timing-logs)
21. [Bridge to external loggers (pino/winston)](#21-bridge-to-external-loggers-pinowinston)

---

## 15. FATAL patterns (without a FATAL level)

> `log-sm` keeps only `ERROR`/`INFO`/`DEBUG` gating. You can model *fatal* semantics at the sink or call site.

**A) Mark fatal via payload (queryable downstream)**

```ts
const log = createLogger({
    sinks: {
        error: (msg: string, data?: any) => {
            // Write to stderr (or forward sang collector)
            console.error(msg, data);

            const isFatal = data?.severity === 'fatal' || data?.severity === 'critical';
            if (!isFatal) return;

            // Optional: Send alert before exit
            try {
                if (data?.action === 'alert') {
                    // Example: call webhook PagerDuty/Slack (sync, short timeout)
                }
            } catch {}

            // Exit if requested (Node-only)
            if (data?.action === 'exit' && typeof process !== 'undefined') {
                // (optional) flush metric/log buffers…
                process.exit(1);
            }
        },
        info:  (m, d) => console.log(m, d),
        debug: (m, d) => console.debug(m, d),
    }
});
```

```ts
// Log a fatal error using structured metadata
log.error('Cannot load signing key from KMS', {
    severity: 'fatal',
    action: 'exit',
    component: 'payments-bootstrap',
    code: 'KMS_ACCESS_DENIED',
    urgent: true,
});
```

```ts
const sys = log.child({ component: 'bootstrap' });
sys.error('Missing ENV', { severity: 'fatal', action: 'exit' });
```

**B) Fatal sink that terminates the process (Node)**

```ts
function fatalSink(inner: (m: string, d?: unknown) => void) {
  return (m: string, d?: any) => {
    inner(m, d);
    try { process.stderr.write('\nFATAL: terminating...\n'); } catch {}
    // Optional: flush buffers / close transports here
    process.exitCode = 1;
    // Avoid immediate exit(1) if you need to flush; otherwise: process.exit(1);
  };
}

const log = createLogger({
  sinks: {
    error: fatalSink(console.error), // treat ALL error() as fatal
    // or: only fatal when payload.severity === 'fatal'
  },
});
```

**C) Fatal handling in browser or edge runtime**

```ts
// Sink implementation for browser / Homey / Edge
const sinksBrowser = {
    error: (msg: string, data?: any) => {
        console.error(msg, data);

        const isFatal = data?.severity === 'fatal' || data?.severity === 'critical';
        if (isFatal) {
            // Notify app layer that a fatal condition occurred
            window.dispatchEvent(new CustomEvent('app-fatal', { detail: data }));

            // Send telemetry / alert beacon
            try {
                navigator.sendBeacon?.('/telemetry', JSON.stringify({ msg, data }));
            } catch {}
        }
    },
    info: (m, d) => console.log(m, d),
    debug:(m, d) => console.debug(m, d),
};
```

```js
<script type="module">
  import { createLogger } from 'https://cdn.skypack.dev/log-sm'; // or esm.run/jsdelivr
  const sinks = {
    error = (m: string, d: any) => {
      console.error(m, d);
      if (d?.severity === 'fatal') {
        // Optional UX: show overlay / modal, then force a reload
        alert('A fatal error occurred. The app will reload.');
        window.location.reload();
      }
    }
  }
  const log = createLogger({ sinks });
</script>
```

**D) Throw after logging (call-site)**

```ts
try {
  // ... something critical
  throw new Error('config missing');
} catch (e) {
  log.error(e, { severity: 'fatal' });
  throw e; // preserve default crash behavior
}
```

**Notes**

- Decide **who** is fatal: the *sink* (centralized policy) vs. the *call-site* (explicit).
- In Node, avoid throwing inside sinks; set `exitCode` and let the process end cleanly, or call `process.exit(1)` if acceptable.
- In browsers, consider UX (show message / overlay) before reload.

---

## 16. Filter / silence by message pattern

> Dynamically suppress or allow logs by message regex, without rebuilding the core logger.

```ts
function makeFilter(
  pattern: RegExp,
  inner: (msg: string, data?: unknown) => void,
  { allow = true } = {}
) {
  return (msg: string, data?: unknown) => {
    const hit = pattern.test(msg);
    if ((allow && !hit) || (!allow && hit)) return;
    inner(msg, data);
  };
}

// Example: only log INFO messages that contain "user:"
const log = createLogger({
  sinks: {
    info: makeFilter(/user:/, console.info, { allow: true }),
    error: console.error,
    debug: console.debug,
  },
});
```

---

## 17. Console grouping / nested views (browser devtools)

> Make complex payloads easier to inspect in the browser or Node-compatible consoles.

```ts
const sinks = {
  info: (msg: string, data?: unknown) => {
    console.groupCollapsed(`[INFO] ${msg}`);
    if (data !== undefined) console.info(data);
    console.groupEnd();
  },
  error: (msg: string, data?: unknown) => {
    console.group(`[ERROR] ${msg}`);
    if (data !== undefined) console.error(data);
    console.groupEnd();
  },
  debug: (msg: string, data?: unknown) => {
    console.groupCollapsed(`[DEBUG] ${msg}`);
    if (data !== undefined) console.debug(data);
    console.groupEnd();
  },
};

const log = createLogger({ sinks, level: LogLevel.DEBUG });
```

---

## 18. Capture unhandled rejections & uncaught exceptions

> Wire Node global events to the logger so you never miss critical failures.

```ts
const log = createLogger({ level: LogLevel.ERROR });

process.on('uncaughtException', (err) => {
  try { log.error(err as Error); } catch {}
});

process.on('unhandledRejection', (reason) => {
  try {
    if (reason instanceof Error) log.error(reason);
    else log.error('unhandledRejection', { reason });
  } catch {}
});
```

*Tip:* Keep handlers resilient—never throw from them.

---

## 19. Remote DEBUG toggle via env / signal

> Temporarily enable verbose logs on a live instance without redeploying.

```ts
const baseLevel = process.env.LOG_LEVEL === 'debug' ? LogLevel.DEBUG : LogLevel.INFO;
let debugWindow = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

function enableDebugFor(ms: number) {
  debugWindow = Date.now() + ms;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => (debugWindow = 0), ms);
}

if (process.env.DEBUG_FOR_MS) enableDebugFor(Number(process.env.DEBUG_FOR_MS));

process.on('SIGUSR2', () => enableDebugFor(60_000)); // e.g., enable 60s on demand

function currentLevel(): LogLevel {
  return Date.now() < debugWindow ? LogLevel.DEBUG : baseLevel;
}

// Recreate the logger whenever the level changes (simple approach)
let log = createLogger({ level: currentLevel() });

// (Optional) poll or hook your config watcher to refresh the logger
setInterval(() => {
  const lvl = currentLevel();
  if (lvl !== log.level) log = createLogger({ level: lvl });
}, 1000);
```

---

## 20. Structured performance / timing logs

> Include cheap timing markers without external libs.

```ts
function withTiming<T>(name: string, f: () => T) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  try {
    return f();
  } finally {
    const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    log.info('timing', { name, ms: +(t1 - t0).toFixed(2) });
  }
}

// Usage
withTiming('load-users', () => service.loadUsers());
```

For async functions:

```ts
async function withTimingAsync<T>(name: string, f: () => Promise<T>) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  try {
    return await f();
  } finally {
    const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    log.info('timing', { name, ms: +(t1 - t0).toFixed(2) });
  }
}
```

---

## 21. Bridge to external loggers (pino/winston)

> Keep `log-sm` for tiny core & API, but ship logs via an existing logger ecosystem.

**Pino**

```ts
import pino from 'pino';
const p = pino();

const log = createLogger({
  sinks: {
    error: (msg, data) => p.error({ ...(data as object || {}) }, msg),
    info:  (msg, data) => p.info ({ ...(data as object || {}) }, msg),
    debug: (msg, data) => p.debug({ ...(data as object || {}) }, msg),
  },
});
```

**Winston**

```ts
import winston from 'winston';
const w = winston.createLogger({
  transports: [new winston.transports.Console()],
});

const log = createLogger({
  sinks: {
    error: (msg, data) => w.error(msg, data),
    info:  (msg, data) => w.info (msg, data),
    debug: (msg, data) => w.debug(msg, data),
  },
});
```

---

### Notes & Tips

- Prefer **sink-level** customization over core changes.
- Make defensive sinks: never throw; guard JSON ops; avoid heavy deep clones.
- Keep prod output compact and stable; keep dev output readable.
- If a pattern becomes common across repos, extract it into a small helper module or preset—**not** into the core.
