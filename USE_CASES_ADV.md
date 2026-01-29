# log-sm · Advanced Use Cases

> Deeper patterns you may need in production environments.  
> These extend the cookbook in **USE_CASES.md** without adding complexity to the core.

## Table of Contents

15. [FATAL patterns (without a FATAL level)](#15-fatal-patterns-without-a-fatal-level-)
    - [Mark fatal via payload (queryable downstream)](#a-mark-fatal-via-payload-queryable-downstream-)
    - [Fatal sink that terminates the process (Node)](#b-fatal-sink-that-terminates-the-process-node-)
    - [Fatal handling in browser or edge runtime](#c-fatal-handling-in-browser-or-edge-runtime-)
    - [Throw after logging (call-site)](#d-throw-after-logging-call-site-)
16. [Filter / silence by message pattern](#16-filter--silence-by-message-pattern-)
17. [Console grouping / nested views (browser devtools)](#17-console-grouping--nested-views-browser-devtools-)
18. [Capture unhandled rejections & uncaught exceptions](#18-capture-unhandled-rejections--uncaught-exceptions-)
19. [Remote DEBUG toggle via signal / runtime switch](#19-remote-debug-toggle-via-signal--runtime-switch-)
    - [Toggle debug window on SIGUSR2 (Node)](#a-toggle-debug-window-on-sigusr2-node-)
    - [HTTP/admin endpoint toggles debug (server)](#b-httpadmin-endpoint-toggles-debug-server-)
20. [Structured performance / timing logs](#20-structured-performance--timing-logs-)
21. [Bridge to external loggers (pino/winston)](#21-bridge-to-external-loggers-pinowinston-)
22. [Deep redaction with guards (Map/Set/TypedArray/cycles)](#22-deep-redaction-with-guards-mapsettypedarraycycles-)
    - [Default mask keys](#a-default-mask-keys-)
    - [Case-insensitive + partial match](#b-case-insensitive--partial-match-)
    - [Mask Map keys + TypedArray](#c-mask-map-keys--typedarray-)


## 15. FATAL patterns (without a FATAL level) [📖](#table-of-contents)

> `log-sm` keeps base gating (`ERROR/INFO/DEBUG`) and a separate `warn()` gate via `warnLevel`. You can model *fatal* semantics at the sink or call site.

### A) Mark fatal via payload (queryable downstream) [📖](#table-of-contents)

```ts
import { createLogger } from 'log-sm';

const log = createLogger({
  sinks: {
    error: (msg, data) => {
      console.error(msg, data);

      const isFatal = (data as any)?.severity === 'fatal' || (data as any)?.severity === 'critical';
      if (!isFatal) return;

      // Optional: alert/telemetry here (best-effort, never throw)
      try {
        // sendBeacon/webhook...
      } catch {}

      // Node-only: set exitCode instead of throwing in sink
      if (typeof process !== 'undefined') {
        process.exitCode = 1;
      }
    },
    info:  (m, d) => console.info(m, d),
    debug: (m, d) => console.debug(m, d),
    // warn not provided -> warnFallback applies (default: console)
  }
});

log.error('Cannot load signing key from KMS', {
  severity: 'fatal',
  component: 'payments-bootstrap',
  code: 'KMS_ACCESS_DENIED',
});

// Child logger
const sys = log.withTags({ component: 'bootstrap' });
sys.error('Missing ENV', { severity: 'fatal', action: 'exit' });
```

### B) Fatal sink that terminates the process (Node) [📖](#table-of-contents)

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

### C) Fatal handling in browser or edge runtime [📖](#table-of-contents)

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

```html
<script type="module">
  import { createLogger } from 'https://cdn.skypack.dev/log-sm'; // or esm.run/jsdelivr

  const sinks = {
    error: (m, d) => {
      console.error(m, d);
      if (d?.severity === 'fatal') {
        // Optional UX: show overlay / modal, then force a reload
        alert('A fatal error occurred. The app will reload.');
        window.location.reload();
      }
    },
  };

  const log = createLogger({ sinks });
</script>
```

### D) Throw after logging (call-site) [📖](#table-of-contents)

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


## 16. Filter / silence by message pattern [📖](#table-of-contents)

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

import { createLogger } from 'log-sm';

// Example: only log INFO messages that contain "user:"
const log = createLogger({
  sinks: {
    info: makeFilter(/user:/, console.info),
    error: console.error,
    debug: console.debug,
  },
});
```


## 17. Console grouping / nested views (browser devtools) [📖](#table-of-contents)

> Make complex payloads easier to inspect in the browser or Node-compatible consoles.

```ts
import { createLogger } from 'log-sm';

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

const log = createLogger({ sinks, level: 'debug' });
```


## 18. Capture unhandled rejections & uncaught exceptions [📖](#table-of-contents)

> Wire Node global events to the logger so you never miss critical failures.

```ts
import { createLogger } from 'log-sm';

const log = createLogger({ level: 'error' });

if (typeof process !== 'undefined' && typeof process.on === 'function') {
    process.on('uncaughtException', (err) => {
        try { log.error(err as Error); } catch {}
    });

    process.on('unhandledRejection', (reason) => {
        try {
            if (reason && typeof reason === 'object' && 'message' in (reason as any)) {
                log.error(reason as Error);
            } else {
                log.error('unhandledRejection', { reason });
            }
        } catch {}
    });
}
```

*Tip:* Keep handlers resilient—never throw from them.


## 19. Remote DEBUG toggle via signal / runtime switch [📖](#table-of-contents)

> Temporarily enable verbose logs on a live instance without redeploying.
> Prefer using the built-in debugForMs() instead of recreating the logger.

### A) Toggle debug window on SIGUSR2 (Node) [📖](#table-of-contents)
```ts
import { createLogger } from 'log-sm';

const log = createLogger({ level: 'info' });

if (typeof process !== 'undefined' && typeof process.on === 'function') {
  process.on('SIGUSR2', () => {
    // Enable DEBUG for 60 seconds, allow INFO, include stack in errors during window
    log.debugForMs(60_000, { allowInfo: true, includeStack: true });
    log.warn('debug window enabled via SIGUSR2');
  });
}
```

### B) HTTP/admin endpoint toggles debug (server) [📖](#table-of-contents)
```ts
// Pseudo example:
app.post('/admin/debug', (req, res) => {
  const ms = Number(req.body?.ms ?? 60_000);
  try {
    log.debugForMs(ms, { allowInfo: true, includeStack: true });
    res.json({ ok: true, ms });
  } catch {
    res.status(400).json({ ok: false });
  }
});
```


## 20. Structured performance / timing logs [📖](#table-of-contents)

> Include cheap timing markers without external libs.

```ts
import { createLogger } from 'log-sm';

const log = createLogger({ level: 'info' });

function withTiming<T>(name: string, f: () => T) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  try {
    return f();
  } finally {
    const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    log.info('timing', { name, ms: +(t1 - t0).toFixed(2) });
  }
}
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


## 21. Bridge to external loggers (pino/winston) [📖](#table-of-contents)

> Keep `log-sm` for tiny core & API, but ship logs via an existing logger ecosystem.

**Pino**

```ts
import pino from 'pino';
import { createLogger } from 'log-sm';

const p = pino();

const log = createLogger({
    sinks: {
        error: (msg, data) => p.error((data && typeof data === 'object') ? (data as object) : { data }, msg),
        info:  (msg, data) => p.info ((data && typeof data === 'object') ? (data as object) : { data }, msg),
        debug: (msg, data) => p.debug((data && typeof data === 'object') ? (data as object) : { data }, msg),
    },
});
```

**Winston**

```ts
import winston from 'winston';
import { createLogger } from 'log-sm';

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


## 22. Deep redaction with guards (Map/Set/TypedArray/cycles) [📖](#table-of-contents)

`log-sm/redact` supports deep redaction with:
- cycle guard (`[Circular]`)
- depth guard (`[DepthLimit]`)
- size guard (`[TooLarge]`)
- Map/Set handling
- optional masking Map keys, typed arrays, inherited keys, symbol keys

### A) Default mask keys [📖](#table-of-contents)
```ts
import { createLogger } from 'log-sm';
import { makeMask } from 'log-sm/redact';

const mask = makeMask(); // uses DEFAULT_MASK_KEYS

const log = createLogger({
  mask,
  truncate: 2000,
});

log.info('login', {
  user: 'alice',
  password: 'secret',
  token: 'abcd',
  nested: { refreshToken: 'xyz' },
});
```

### B) Case-insensitive + partial match [📖](#table-of-contents)
```ts
import { makeMask } from 'log-sm/redact';

const mask = makeMask(['token', 'password'], {
  ciKeys: true,
  partialMatch: true, // masks keys like accessToken, idToken, my_token, ...
});

const log = createLogger({ mask });
```

### C) Mask Map keys + TypedArray [📖](#table-of-contents)
```ts
import { makeMask } from 'log-sm/redact';

const mask = makeMask(undefined, {
  maskMapKeys: true,
  maskTypedArrays: true,
});

const log = createLogger({ mask });

log.info('payload', {
  headers: new Map([
    ['authorization', 'Bearer abc'],
    ['x-api-key', '123'],
  ]),
  bytes: new Uint8Array(10_000),
});
```
