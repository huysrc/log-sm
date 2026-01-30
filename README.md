[![npm version](https://img.shields.io/npm/v/log-sm.svg?style=flat-square)](https://www.npmjs.com/package/log-sm)
[![bundle size](https://img.shields.io/bundlephobia/minzip/log-sm?style=flat-square)](https://bundlephobia.com/result?p=log-sm)
[![license](https://img.shields.io/github/license/huysrc/log-sm?style=flat-square)](./LICENSE)

# 🪶 log-sm - Smart Minimal Logger

A **zero-deps**, tiny, predictable logger for **Node + Browser** with:
- **Strict gating** for `ERROR / INFO / DEBUG`
- **Independent WARN gate** (WARN is not a base level)
- Optional **custom sinks** (file/HTTP/OTel/etc.) or clean **console fallback**
- Optional **mask** (redaction) and **truncate** (shallow) pipeline
- Runtime **temporary debug window** (`debugForMs`) and scoped overrides (`withLevel`, `withLevelTimed`)
- Works across runtimes (Node, Homey, browsers, workers, SSR, test runners) with guarded capability checks

> Design note: `log-sm` built around a **tiny-first core** and predictable. 
> It does **not** guarantee “logging never throws” for exotic/adversarial inputs
> (revoked Proxy, throwing getters, broken polyfills, etc.). If you need “never throw”,
> sanitize inputs or wrap your `mask()` with try/catch.


## 📦 Install

```bash
npm i log-sm
# or
yarn add log-sm
# or
pnpm add log-sm
```

No peer dependencies. TypeScript types included.

## 🚀 Quick start

```ts
import { createLogger } from 'log-sm';

const log = createLogger();

log.error('something failed', { code: 'E_FAIL' });
log.warn('slow request', { ms: 1200 });
log.info('server started', { port: 8080 });
log.debug('details', { a: 1 });
```

## ✨ Features

- 🪶 **Tiny Core** – zero dependencies, minimal branching, 100% tree-shakable.
- 🧩 **Pluggable Sinks** – console fallback or custom transport.
- 🧬 **Structured Logging** – consistent `(message, data)` signature.
- 🐘 **Environment-Aware Levels** – auto resolves from `LOG_LEVEL`, `DEBUG_MODE`, or `NODE_ENV`.
- ⚠️ **Smart WARN Policy** – no `WARN` enum level, it shares `ERROR` threshold by default (customizable by `warnLevel`).
- 📦 **Production-Ready Defaults** – defaults to `INFO` in dev, `ERROR` in production (overrideable by `prodDefault`).
- 🔒 **Mask & Truncate** – deep redact sensitive fields and clamp long strings. (optional)
- 🌈 **Console Formatter** – optional, colorized, single-line output.
- 🧮 **Stack Policy** – flexible `auto | always | never` inclusion for Errors.
- 🤝 **Child Loggers** – attach contextual tags (service, tenant, etc.) cheaply.
- 🌱 **Type-Safe** – written in pure TypeScript, Node/browser compatible.


## 🧠 Philosophy

> 🧦 “Factory-only” design — configuration resolved once, runtime is pure direct call.

Each `createLogger()` call builds a specialized instance.  
All options (`mask`, `truncate`, `formatter`, etc.) are applied once — the returned logger runs branch-free.

### Benefits:
- Zero runtime branching — hot paths as fast as `console.log`.
- Predictable and environment-aware.
- No globals, no side effects.
- Fully composable (`child()`, custom sinks).


## 🔑 Levels & WARN policy

`log-sm` has these gating levels:
```ts
declare const LogLevel: {
  readonly NONE: 0;
  readonly ERROR: 1;
  readonly INFO: 2;
  readonly DEBUG: 3;
};
```
### ⚠️ _WARN_ is special; It is not a base gating level, but:
- `warn()` is gated by `warnLevel` (default: `error`)
- This means WARN can still be visible even when base `level === 'error'`

>In short: `warn()` behaves like an attitude, not a level — it stays visible when it matters, and you decide where it flows.  
>This approach keeps level gating simple, predictable, and expressive.

**Example:**
```ts
const log = createLogger({ level: 'error' }); // base gate: error
log.warn('this is visible by default');       // because warnLevel defaults to 'error'
log.info('not visible');
```

If you want conventional behavior (WARN visible only when INFO is enabled):

```ts
const log = createLogger({ level: 'error', warnLevel: 'info' });
log.warn('not visible now');
```

### 📌 Level resolution from `env`

If `CreateLoggerOptions.level` is omitted, base level is resolved by:
 1. `DEBUG_MODE=1|true|yes|on` (case-insensitive) → `debug`
 2. `LOG_LEVEL=NONE|ERROR|INFO|DEBUG|OFF|ERR|DBG|0..3` (case-insensitive)
    - Special-case: `LOG_LEVEL=WARN|WRN` (case-insensitive) → base level becomes `warnLevel`
 3. Otherwise:
    - `NODE_ENV=production` → `prodDefault` (default: `error`)
    - else → `info`

>Tip: You can provide `options.env` (recommended for tests / browser / SSR) instead of relying on `process.env`.

---

## 🦭 Logger API

### 🧮 Options Overview - `createLogger(options)`

```ts
export type CreateLoggerOptions = {
  sinks?: { error?: Sink; warn?: Sink; info?: Sink; debug?: Sink } | null;

  level?: LogLevel | 'none' | 'error' | 'info' | 'debug';
  levelTags?: { error?: string; warn?: string; info?: string; debug?: string } | null;

  warnLevel?: LogLevel | 'none' | 'error' | 'info' | 'debug';
  warnFallback?: 'error' | 'info' | 'debug' | 'console' | 'ignore';
  debugFallback?:
    | 'console'     // default: console.debug()
    | 'info'        // reuse info sink
    | 'ignore';     // drop output
  errorStackPolicy?:
    | 'auto'        // default: include stack unless `NODE_ENV=production`
    | 'always'      // always include stack when an Error is logged.
    | 'never';      // never include stack.
  errorInputPolicy?:
    | 'never'       // never attach the original input to payload
    | 'ifNonError'  // attach when input is not an instance of Error
    | 'always';     // always attach (even if Error or anything else)
  inputKey?: string;

  truncate?: number;
  mask?: (v: unknown) => unknown;
  tags?: Record<string, string|number>;
  mergeTagsPolicy?:
    | 'dataWins'    // { ...tags, ...data }
    | 'tagsWin';    // { ...data, ...tags }
  consoleFormatter?: ConsoleFormatter;

  env?: Record<string, string|undefined>;
  prodDefault?: LogLevel | 'none' | 'error' | 'info' | 'debug';
};
```

### ⚙️ Sinks Behavior (important)
- `sinks: null` → no-op logger (all calls do nothing)
- `sinks: undefined` → fallback to console (console.error/warn/info/debug)
- `sinks: { ... }` → use provided sinks where present
  - Missing `warn` / `debug` follow `warnFallback` / `debugFallback`
  - Missing `error` / `info` fall back to `console`

>Note: Custom `sinks.*` take precedence over `consoleFormatter`.

### ⚙️ Another Behavior Summary

| Option             | Purpose                                     | Default           |
|--------------------|---------------------------------------------|-------------------|
| `levelTags`        | Apply prefix strings per level              | —                 |
| `warnLevel`        | Separate warn visibility                    | `error`           |
| `warnFallback`     | Redirect `warn()` when missing sink         | `console.warn()`  |
| `debugFallback`    | Redirect `debug()` when missing sink        | `console.debug()` |
| `errorStackPolicy` | When to include stack                       | `'auto'`          |
| `errorInputPolicy` | Merge rule for error inputs                 | `'auto'`          |
| `inputKey`         | Key for non-Error inputs                    | `'input'`         |
| `truncate`         | Clamp long string fields (per-string field) | `0` (off)         |
| `mask`             | Apply redaction before output               | —                 |
| `tags`             | Static metadata merged on each log          | —                 |
| `mergeTagsPolicy`  | Tag vs data precedence (merge order)        | `dataWins`        |
| `consoleFormatter` | Optional console formatter (color, JSON...) | —                 |
| `env`              | Custom env bag                              | —                 |
| `prodDefault`      | Override prod default level                 | `error`           |

### ⚙️ Console Formatter

`consoleFormatter` lets you customize how logs are printed **when using the built-in console fallback**.

A formatter must return an object in the shape:

- `msg`: the final string to print
- `data` (optional): structured payload for `console` to render nicely (recommended)

```ts
type ConsoleFormatter = (
    level: 'error' | 'warn' | 'info' | 'debug',
    msg: string,
    data: unknown
) => { msg: string; data?: unknown };
```

>Tip: format the message only and keep `data` structured, so the console can inspect/expand objects.

#### 👉 Recommended: format the message only, keep payload structured

Use `createConsoleFormatter()` from `log-sm/format` to build a "line formatter", then wrap it into `consoleFormatter`:
```ts
import { createLogger } from 'log-sm';
import { createConsoleFormatter } from 'log-sm/format';

const line = createConsoleFormatter('auto');

const log = createLogger({
  consoleFormatter: (level, msg, data) => ({
    msg: line(level, msg),
    data,
  }),
});

log.info('hello', { a: 1 });
```

#### 👉 Alternative: embed payload into the message (omit `data`)

If you want a single text line (e.g. for systems that only accept strings), you can embed the payload into `msg` and omit `data`:

```ts
import { createLogger } from 'log-sm';
import { createConsoleFormatter } from 'log-sm/format';

const line = createConsoleFormatter('auto');

const log = createLogger({
  consoleFormatter: (level, msg, data) => ({
    msg: line(level, msg, data), // formatter includes payload text/JSON
    data: undefined,             // omit structured payload
  }),
});
```

>**Notes:**
>- `consoleFormatter` applies only to the console fallback. If you provide custom sinks (`sinks.info`,
>  `sinks.error`, ...), formatting should be handled in those sinks.
>- For redaction/truncation, prefer using `mask/truncate` options and keep `consoleFormatter` focused on presentation.

### ⚙️ Error Logging Behavior
`error()` accepts:
- Error (or “error-like”) → normalized payload: { name, message, stack? } plus enumerable custom fields
- non-Error input (e.g. string) → payload uses { [inputKey]: input } depending on errorInputPolicy

Stack inclusion:
- errorStackPolicy: 'auto' → include stack unless NODE_ENV=production
- temporary debug window (debugForMs) can force stack inclusion while active

### ⚙️ Masking & Truncation Pipeline
If provided:
- Order is: mask → truncate
- truncate is shallow per string field, and also stringifies BigInt / summarizes Buffer.

**Example:**
```ts
import { createLogger } from 'log-sm';
import { makeMask } from 'log-sm/redact';

const mask = makeMask(); // uses DEFAULT_MASK_KEYS

const log = createLogger({
    mask,
    truncate: 2000,
});

log.info('login', { user: 'a', password: 'secret', token: 'abc', bio: '...' });
```
> `redact.ts` supports deep redaction with guards and special cases (Map/Set/TypedArray/Error/Buffer).

### ⚙️ Tags, withTags(), child()

#### 🔹 Static tags
```ts
const log = createLogger({ tags: { service: 'api', env: 'prod' } });
log.info('started', { port: 8080 }); // payload includes service/env
```

#### 🔹 withTags()
```ts
const log = createLogger();
const auth = log.withTags({ module: 'auth' });

auth.warn('invalid credentials', { userId: 123 });
```

#### 🔹 child()
`child()` shallow-merges options (`{...parentOpts, ...childOpts}`).
```ts
const log = createLogger({ level: 'info' });
const noisy = log.child({ level: 'debug' });

noisy.debug('enabled here');
```

### ⚙️ Runtime Overrides

#### 🔹 debugForMs(ms)
Enables a temporary debug window without changing level:
```ts
const log = createLogger({ level: 'error' });

const stop = log.debugForMs(10_000, { allowInfo: true, includeStack: true });

log.debug('visible during window');
log.info('also visible during window');
stop(); // end early (idempotent)
```

#### 🔹 withLevel(level, fn)
Scoped override for sync/async:
```ts
await log.withLevel('debug', async (l) => {
l.debug('inside scope');
});
```

#### 🔹 withLevelTimed(level, ms)
```ts
const dispose = log.withLevelTimed('debug', 5000);
dispose(); // end early
```

>Timers note: in runtimes without timers, timed overrides won’t auto-expire (manual dispose still works).

---

## 🧬 Redaction API (`log-sm/redact`)

```ts
import { makeMask, redact, extendDefaultMaskKeys } from 'log-sm/redact';
```

- `makeMask()` → returns `(value) => maskedValue` for `CreateLoggerOptions.mask`
- Cycle-safe, depth-limited, handles `Error`, `Map`, `Set`, `TypedArray`, `Buffer`.
- Default sensitive keys:  
  `password`, `token`, `token`, `idToken`, `accessToken`, `refreshToken`, `authorization`  
  `secret`, `clientSecret`, `apiKey`, `x-api-key`  
  `card`, `cvv`, `ssn`


### Redact Options
```ts
export type RedactOptions = {
  mask?: string;               // replace value for matching keys. (default: '***')
  ciKeys?: boolean;            // case-insensitive key matching. (default: false)
  partialMatch?: boolean;      // substring match for keys. (default: false)
  maskMapKeys?: boolean;       // also mask Map keys. (default: false)
  maskTypedArrays?: boolean;   // replace typed arrays with placeholders. (default: false)
  includeInherited?: boolean;  // include inherited enumerable keys. (default: false)
  includeSymbols?: boolean;    // include symbol keys; default false for speed
  getterErrorValue?: string;   // value to use when a getter throws. (default: '[GetterError]')
  maxDepth?: number;           // max recursion depth; 0 = only root. (default: 8)
  maxNodes?: number;           // max visited nodes to avoid pathological graphs. (default: 50_000)
};
```

### Security Notes

- Redaction is opt-in. If you log sensitive fields, wire mask using log-sm/redact.
- `DEFAULT_MASK_KEYS` includes common secret-like keys; extend via `extendDefaultMaskKeys([...])` if needed.
- Consider masking Map keys (`maskMapKeys`) when you pass Map as data.

---

## 🚀 Performance Tips

- Avoid `mask` and `truncate` unless necessary.
- Use `child()` for contextual metadata instead of re-merging objects.
- Each logger is a pre-compiled pipeline — hot path ~ `console.log` speed.

## ❓ FAQ

**Q:** Why not support printf-style templates?  
**A:** Simplicity and speed. Use structured data instead.

**Q:** Can I toggle debug at runtime?  
**A:** Yes — use `debugForMs(ms)` to enable temporary DEBUG visibility.

**Q:** Will it break on BigInt or circular objects?  
**A:** No — built-in formatters are JSON-safe and circular-tolerant.

## 📖 More Examples & Recipes

See more practical patterns for customizing and extending **log-sm** without changing the core:

- [**USE_CASES.md**](./USE_CASES.md) — common real-world usages:
    - error input policies, console/custom sinks, JSON logging, redaction, deduplication, tags, and runtime debug.
- [**USE_CASES_ADV.md**](./USE_CASES_ADV.md) — advanced production patterns:
    - filtering by message pattern, grouped console logs, global error capture, remote debug toggles, performance timing, and bridging to external loggers.

## ✎ᝰ. License

MIT — © 2026 [⋆⋅☆⋅⋆ HuySrc ⋆⋅☆⋅⋆](https://huynguyen.net) ദ്ദി(•̀ ᗜ <)
