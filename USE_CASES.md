# log-sm · Use Cases & Recipes

> Practical examples for customizing and extending **log-sm**
> without adding complexity to the core.

## Table of Contents

1. [Error input policy](#1-error-input-policy-)
2. [Console vs. custom sinks](#2-console-vs-custom-sinks-)
3. [Wrap error under `error:{}`](#3-wrap-error-under-error-)
4. [Drop stack traces in production](#4-drop-stack-traces-in-production-keep-them-in-dev-)
5. [OpenTelemetry mapping](#5-map-to-opentelemetry-exception-semantic-keys-)
6. [Emit JSON lines](#6-emit-json-lines-one-line-for-ingestion-)
7. [Redaction and truncation](#7-redaction-and-truncation-)
8. [Normalize mixed error sources](#8-normalize-mixed-error-sources-)
9. [Tag merge policies](#9-tag-merge-policies-)
10. [WARN routing](#10-warn-routing-)
11. [Runtime debug toggle](#11-runtime-debug-toggle-opt-in-)
12. [Per-sink deduplicate / rate-limit](#12-per-sink-deduplicate--rate-limit-)
13. [Multi-transport fan-out](#13-multi-transport-fan-out-)
14. [Browser usage (bundlers & CDN)](#14-browser-usage-bundlers--cdn-)
15. [Homey examples](#15-homey-examples-)
16. [Guidelines](#16-guidelines-)


## 1. Error input policy [📖](#table-of-contents)

```ts
// 1) Default: 'ifNonError'
// - Error input: only normalized error (no {input})
// - Non-error input: add {input: value}
createLogger();

// 2) Always attach input (even for Error)
createLogger({ errorInputPolicy: 'always' });

// 3) Never attach input
createLogger({ errorInputPolicy: 'never' });
```

Use when you need or don’t need the raw input attached beside normalized Error.


## 2. Console vs. custom sinks [📖](#table-of-contents)

```ts
// A) Console only (pretty dev output)
createLogger({
    level: LogLevel.DEBUG,
    consoleFormatter: (level, msg, data) => {
        return { msg: `[${level}] ${msg}`, data}
    }
});

// B) Custom sinks (ship JSON to your transport)
const ship = (line: unknown) => {/* send to file/HTTP/Kafka */};
createLogger({
    sinks: {
        error: (m, d) => ship({ level: 'error', m, ...d }),
        info:  (m, d) => ship({ level: 'info',  m, ...d }),
        debug: (m, d) => ship({ level: 'debug', m, ...d }),
    },
});
```

### 🟦 Custom console formatter with color and timestamp

```ts
// Console: Custom Color + Timestamp Formatter
// Tip: return `data` as-is (let the console render objects) instead of JSON.stringify.
createLogger({
    consoleFormatter: (level, msg, data) => {
        const c = {
            error: '\x1b[31m', // red
            warn:  '\x1b[33m', // yellow
            info:  '\x1b[36m', // cyan
            debug: '\x1b[90m', // gray
        }[level];
        const reset = '\x1b[0m';
        const ts = new Date().toISOString();
        const line = `${c}${ts} [${level.toUpperCase()}] ${msg}${reset}`;
        return data === undefined ? { msg: line } : { msg: line, data };
    },
});
```

> Produces colored, timestamped output in Node terminals.  
> Works automatically for all console fallback sinks (no custom sinks provided).


## 3. Wrap error under `error:{}` [📖](#table-of-contents)

```ts
/** Wrap flat error fields under `error:{...}` for backend schema consistency. */
const sinks = {
    error: (msg: string, p?: Record<string, unknown>) => {
        if (!p) return console.error(msg);
        const { name, message, stack, ...rest } = p;
        const shaped = stack == null
            ? { error: { name, message }, ...rest }
            : { error: { name, message, stack }, ...rest };
        // send to transport
        console.error(msg, shaped);
    },
    info: console.info,
    debug: console.debug,
};

const log = createLogger({ sinks });
```


## 4. Drop stack traces in production, keep them in dev [📖](#table-of-contents)

```ts
/** Remove `stack` in production to reduce noise/PII risk. */
const sinks = {
    error: (msg: string, p?: Record<string, unknown>) => {
        if (!p) return console.error(msg);
        const isProd = process.env.NODE_ENV === 'production';
        const { stack, ...rest } = p;
        console.error(msg, isProd ? rest : p);
    },
    info: console.info,
    debug: console.debug,
};

const log = createLogger({ sinks });
```


## 5. Map to OpenTelemetry exception semantic keys [📖](#table-of-contents)

```ts
/** Map normalized error to OTel-like keys for better cross-tooling. */
const sinks = {
    error: (msg: string, p?: Record<string, unknown>) => {
        if (!p) return console.error(msg);
        const { name, message, stack, ...rest } = p;
        const otel = {
            'exception.type': name,
            'exception.message': message,
            ...(stack ? { 'exception.stacktrace': stack } : {}),
            ...rest,
        };
        console.error(msg, otel);
    },
    info: console.info,
    debug: console.debug,
};

const log = createLogger({ sinks });
```


## 6. Emit JSON lines (one-line) for ingestion [📖](#table-of-contents)

```ts
/** Emit newline-delimited JSON for file shippers (vector/fluent-bit). */
const toLine = (lvl: string, msg: string, data?: unknown) =>
  JSON.stringify({ t: Date.now(), lvl, msg, data });

const log = createLogger({
  sinks: {
    error: (m, d) => process.stdout.write(toLine('error', m, d) + '\n'),
    warn:  (m, d) => process.stdout.write(toLine('warn',  m, d) + '\n'),
    info:  (m, d) => process.stdout.write(toLine('info',  m, d) + '\n'),
    debug: (m, d) => process.stdout.write(toLine('debug', m, d) + '\n'),
  },
});
```


## 7. Redaction and truncation [📖](#table-of-contents)

Prefer using the built-in `mask` + `truncate` options (fast, predictable), and keep transports thin.

```ts
// Example uses the helper in `redact.ts` (recommended) to build a reusable mask function.
import { createLogger } from 'log-sm';
import { makeMask } from 'log-sm/redact';

const log = createLogger({
  // Redact common secrets (password/token/authorization/...), deep + cycle-safe.
  mask: makeMask(), // defaults to DEFAULT_MASK_KEYS
  // Shallow-truncate long string fields (and normalized error fields) per property.
  truncate: 8192,
});

// This will be masked + truncated before it reaches sinks/console.
log.info('login', { user: 'alice', password: 'super-secret', token: 'abc...' });
log.error(new Error('boom'), { authorization: 'Bearer ...' });
```


## 8. Normalize mixed error sources [📖](#table-of-contents)

```ts
/** Keep only whitelisted fields for easy querying. */
const sinks = {
    error: (msg: string, p?: Record<string, unknown>) => {
        const allow = ['name', 'message', 'stack', 'code', 'status', 'cause'];
        const q: Record<string, unknown> = {};
        for (const k of allow) if (p && k in p!) q[k] = (p as any)[k];
        console.error(msg, q);
    },
    info: console.info,
    debug: console.debug,
};

const log = createLogger({ sinks });
```


## 9. Tag merge policies [📖](#table-of-contents)

Tags are static key-values merged into structured `data` on every call.

```ts
import { createLogger } from 'log-sm';

// Default: dataWins => `{ ...tags, ...data }`
const base = createLogger({ /* mergeTagsPolicy: 'dataWins' */ });

// Add tags via withTags(...)
const srv = base.withTags({ srv: 'billing', region: 'us-west' });

// dataWins: when keys collide, `data` overwrites `tags`
srv.info('charge ok', { region: 'us-east', amount: 12.3 });
// -> { srv:'billing', region:'us-east', amount:12.3 }
```

If you prefer tags to win:

```ts
const base2 = createLogger({ mergeTagsPolicy: 'tagsWin' });
```


## 10. WARN routing [📖](#table-of-contents)

`warn()` has its own gate: `warnLevel` (default: `ERROR`).  
If you want conventional behavior (WARN shows up only when base level is INFO+), set `warnLevel: INFO`.

```ts
import { createLogger, LogLevel } from 'log-sm';

const log = createLogger({
    level: LogLevel.INFO,        // base gate for error/info/debug
    warnLevel: LogLevel.INFO,    // WARN visible only when base gate is INFO+
    sinks: {
        warn:  (msg, d) => myWarnTransport({ msg, data: d }),
        info:  (msg, d) => myInfoTransport({ msg, data: d }),
        error: (msg, d) => myErrTransport({ msg, data: d }),
    },
});
```


## 11. Runtime DEBUG toggle (opt-in) [📖](#table-of-contents)

Use `debugForMs()` (doesn't change base `level`) or `withLevelTimed()` (temporarily changes `level`).

```ts
import { createLogger, LogLevel } from 'log-sm';

const log = createLogger({ level: LogLevel.INFO });

// Enable debug logs for 30s (and include stack traces for Error during the window)
const stop = log.debugForMs(30_000, { allowInfo: false, includeStack: true });

// ...later (optional)
stop();
```

Or: temporarily raise the base level for 30s:

```ts
log.withLevelTimed(LogLevel.DEBUG, 30_000);
```


## 12. Per-sink deduplicate / rate-limit [📖](#table-of-contents)

```ts
/** Drop identical error messages if they repeat too fast. */
function makeDedupSink<T extends (msg: string, data?: unknown) => void>(inner: T, windowMs = 2000): T {
  let lastKey = '', lastTs = 0;
  return ((msg: string, data?: unknown) => {
    const now = Date.now();
    const key = msg + '|' + JSON.stringify(data ?? {});
    if (key === lastKey && (now - lastTs) < windowMs) return;
    lastKey = key; lastTs = now;
    inner(msg, data);
  }) as T;
}

const sinks = {
  error: makeDedupSink(console.error, 3000),
  info:  console.info,
  debug: console.debug,
};

const log = createLogger({ sinks });
```


## 13. Multi-transport fan-out [📖](#table-of-contents)

```ts
/** Fan-out to file + http simultaneously, without blocking the core path. */
const fileSink  = (msg: string, d?: unknown) => {/* append line */};
const httpSink  = (msg: string, d?: unknown) => {/* enqueue batch */};

const multi = (a: any, b: any) => (msg: string, d?: unknown) => { a(msg, d); b(msg, d); };

const log = createLogger({
  sinks: {
    error: multi(fileSink, httpSink),
    info:  multi(fileSink, httpSink),
    debug: multi(fileSink, httpSink),
  },
});

```


## 14. Browser usage (bundlers & CDN) [📖](#table-of-contents)

**A) Bundlers (Vite/Webpack/Rspack/Parcel)**

```ts
// ESM import (recommended)
import { createLogger, LogLevel } from 'log-sm';

const log = createLogger({
  level: import.meta.env.DEV ? LogLevel.DEBUG : LogLevel.INFO,
  // No sinks = fallback to console.* (works in browsers)
});

log.info('hello from browser', { ua: navigator.userAgent });
log.error(new Error('boom'));
```

**B) CDN (global)**

```html
<script type="module">
  import { createLogger, LogLevel } from 'https://cdn.skypack.dev/log-sm'; // or esm.run/jsdelivr
  const log = createLogger({ level: LogLevel.INFO });
  log.debug('hidden in prod');
</script>
```

**Notes**

- Colors: ANSI sequences do not render in browsers; use plain text or CSS if needed.
- Sourcemaps: your app/bundler controls stack quality, not the logger.
- CSP: `console.*` works under strict CSP; no eval required by log-sm.
- Tree-shaking: keep imports minimal; the core is tiny by design.
- Perf: avoid heavy `JSON.stringify` on circular objects; keep payloads lean.


## 15. Homey examples [📖](#table-of-contents)

```ts
// Reuse Homey sinks
createLogger({
  sinks: {
    error: (m, d) => Homey.error(m,d),
    info:  (m, d) => Homey.log(m,d),
    debug: (m, d) => Homey.log('[DEBUG]', m, d),
  },
});
```


## 16. Guidelines [📖](#table-of-contents)

- The **core** handles levels, tags, and minimal error normalization.
- All shaping, masking, routing, dedup, or transformation should be done **in sinks**.
- Favor small, predictable, one-way flows.
- In dev: readable; in prod: compact, schema-stable.
- Core stays “zero magic”; custom logic lives in user land.


---

### 🧭 Tip

If you discover a recurring pattern across projects,  
extract it into a small helper module or shareable sink preset,  
**not** into the core — keeping `log-sm` tiny-first forever.


### 🔧 Troubleshooting

- **“Why is `{input: ...}` attached or not attached?”**  
  → Controlled by `errorInputPolicy`.
  - `'auto'`: attaches only for non-Error inputs.
  - `'always'`: always attaches `{input}`.
  - `'never'`: never attaches it.

- **“My console formatter doesn’t run!”**  
  → The `consoleFormatter` runs **only** when you’re using default console sinks  
  (i.e., no `sinks` provided). If you define custom sinks, they fully take over output.

- **“WARN doesn’t show up.”**  
  → `warn()` visibility is gated by **`warnLevel`**.
  - If you explicitly set `warnLevel`, it uses that threshold.
  - If `warnLevel` is **not** set, it **falls back to `LogLevel.ERROR`** (i.e., WARN hidden when base level is below ERROR’s visibility).  
    Also remember: sink routing (`sinks.warn`) is independent from level gating.

- **“Stack trace missing in production.”**  
  → Ensure your sink isn’t stripping it (see [UC-4](#4-drop-stack-traces-in-production-keep-them-in-dev-)).  
  Also check that your `StackPolicy` (if used) isn’t set to `'never'`.

- **“Formatter colors aren’t visible.”**  
  → ANSI colors only render in TTY terminals.  
  If logs are redirected to a file or CI, most terminals strip escape codes automatically.

- **“DEBUG messages sometimes disappear.”**  
  → The logger obeys the current `level`.  
  If you used `debugForMs()` or similar runtime toggle, it expires automatically after the window ends.


### 👉 More...
- See [**USE_CASES_ADV.md**](./USE_CASES_ADV.md) for more advanced use cases