# 🪶log-sm
```
┌────────────────────────────────┐
│   log-sm · Smart Minimal Log   │
└────────────────────────────────┘
```

[![npm version](https://img.shields.io/npm/v/log-sm.svg?style=flat-square)](https://www.npmjs.com/package/log-sm)
[![bundle size](https://img.shields.io/bundlephobia/minzip/log-sm?style=flat-square)](https://bundlephobia.com/result?p=log-sm)
[![license](https://img.shields.io/github/license/huynguyen/log-sm?style=flat-square)](./LICENSE)

> Zero-deps • Zero noise • Just logs — clean, fast, predictable, and environment-aware.

A **zero-dependency**, **ultra-fast**, **structured logger** for **Node**, **Homey**, and **Web** runtimes.  
Built around a **tiny-first core** with optional **deep redaction**, **pluggable sinks**, and **predictable levels** —  
ideal for developers who value **clarity**, **lightweight design**, and **control** without heavy abstractions.

---

## 🧬 Example Preview

```ts
import { createLogger } from 'log-sm';

const { logger } = createLogger();

logger.info('Server started', { port: 8080 });
// Server started { port: 8080 }
```

🔹 Add deep redaction (optional):

```ts
import { createLogger } from 'log-sm';
import { makeMask } from 'log-sm/redact';

const mask = makeMask(undefined, { ciKeys: true, partialMatch: true }); // case-insensitive, substring match and default mask keys.
const { logger } = createLogger({ mask });

logger.debug('Login', { user: 'me', password: 'abc123' });
// Login { user: "me", password: "***" }
```

🔹 Enable temporary debug:

```ts
const { logger, debugForMs } = createLogger();

debugForMs(3000); // enable DEBUG for 3 seconds
logger.debug('trace start');
// after 3s, debug reverts automatically
```

---

## ✨ Features

- 🪶 **Tiny Core** – zero dependencies, minimal branching, 100% tree-shakable.
- 🧬 **Pluggable Sinks** – console fallback or custom transport.
- 🧠 **Structured Logging** – consistent `(message, data)` signature.
- 🦭 **Environment-Aware Levels** – auto resolves from `LOG_LEVEL`, `DEBUG_MODE`, or `NODE_ENV`.
- ⚠️ **Smart WARN Policy** – no `WARN` enum level, it shares `ERROR` threshold by default (customizable by `warnLevel`).
- ⚙️ **Production-Ready Defaults** – defaults to `INFO` in dev, `ERROR` in production (overrideable by `prodDefault`).
- 🔒 **Mask & Truncate** – deep redact sensitive fields and clamp long strings. (optional)
- 🌈 **Console Formatter** – optional, colorized, single-line output.
- 🦾 **Stack Policy** – flexible `auto | always | never` inclusion for Errors.
- 🧱 **Child Loggers** – attach contextual tags (service, tenant, etc.) cheaply.
- 🧮 **Type-Safe** – written in pure TypeScript, Node/browser compatible.

---

## 🧱 Philosophy

> 🧦 “Factory-only” design — configuration resolved once, runtime is pure direct call.

Each `createLogger()` call builds a specialized instance.  
All options (`mask`, `truncate`, `formatter`, etc.) are applied once — the returned logger runs branch-free.

**Benefits:**
- Zero runtime branching — hot paths as fast as `console.log`.
- Predictable and environment-aware.
- No globals, no side effects.
- Fully composable (`child()`, custom sinks).

---

## ⚠️ Why No `LogLevel.WARN`

`log-sm` uses only three strict levels:  
`ERROR`, `INFO`, and `DEBUG` — and gives `WARN` its own gate instead of being a level.

| Concept        | Behavior                                                      |
|----------------|---------------------------------------------------------------|
| `warnLevel`    | Controls when `warn()` is visible (default: same as `ERROR`). |
| `warnFallback` | Redirects `warn()` if no custom sink is defined.              |

```ts
const { logger } = createLogger({
  warnLevel: LogLevel.INFO,     // show warnings like info
  warnFallback: 'error',        // reuse error sink
});
```

In short: warn() behaves like an attitude, not a level — it stays visible when it matters, and you decide where it flows.  
This approach keeps level gating simple, predictable, and expressive.

---

## 🧬 CreateLoggerOptions

```ts
export type CreateLoggerOptions = {
  sinks?: {
    error?: (msg: string, data?: unknown) => void;
    warn?:  (msg: string, data?: unknown) => void;
    info?:  (msg: string, data?: unknown) => void;
    debug?: (msg: string, data?: unknown) => void;
  } | null;

  level?: LogLevel;                       // Base gate for info/debug
  warnLevel?: LogLevel;                   // Separate gate for warn()
  warnFallback?: 'error'|'info'|'debug'|'console'|'ignore'; // default: 'console'
  debugFallback?: 'info'|'console'|'ignore';                // default: 'console'
  consoleFormatter?: (level: 'error'|'warn'|'info'|'debug', msg: string, data?: unknown) => string;
  levelTags?: { error?: string; warn?: string; info?: string; debug?: string } | null;

  truncate?: number;                      // shallow truncate long strings
  mask?: (v: unknown) => unknown;         // optional redact function
  tags?: Record<string, string|number>;   // static tags merged on each log
  mergeTagsPolicy?: 'dataWins'|'tagsWin'; // merge order

  includeStack?: 'never'|`ifNonError`|'always'; // when to include stack
  errorInputPolicy?: 'auto'|'always'|'never';   // merge rule for error inputs
  inputKey?: string;                            // key for non-Error inputs (default: 'input')

  env?: Record<string, string|undefined>; // custom env bag
  prodDefault?: LogLevel;                 // default prod level (default: ERROR)
};
```

---

### ⚙️ Behavior Summary

| Option             | Purpose                            | Default         |
|--------------------|------------------------------------|-----------------|
| `sinks`            | Custom output targets              | `console.*`     |
| `sinks: null`      | Silent (no-op) logger              | —               |
| `warnLevel`        | Separate warn visibility           | `ERROR`         |
| `warnFallback`     | Redirect warn() when missing sink  | `console.warn`  |
| `debugFallback`    | Redirect debug() when missing sink | `console.debug` |
| `consoleFormatter` | Single-line or colorized output    | —               |
| `levelTags`        | Apply prefix strings per level     | —               |
| `mask`             | Apply redaction before output      | —               |
| `truncate`         | Clamp long string fields           | 0 (off)         |
| `tags`             | Static metadata (cheap merge)      | —               |
| `mergeTagsPolicy`  | Tag vs data precedence             | `dataWins`      |
| `includeStack`     | Stack inclusion rule               | `'ifNonError'`  |
| `errorInputPolicy` | Input merge rule for error()       | `'auto'`        |
| `prodDefault`      | Override prod default level        | `ERROR`         |

---

## 🦭 LogLevel

```ts
export const enum LogLevel {
  NONE = 0,
  ERROR = 1,
  INFO  = 2,
  DEBUG = 3
}
```

- Auto-resolves from environment:
    - `DEBUG_MODE=1|true|yes|on` → DEBUG
    - `LOG_LEVEL=ERROR|INFO|DEBUG|0..3`
    - Default: `ERROR` in production, else `INFO`.

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


### RedactOptions
```ts
export type RedactOptions = {
  mask?: string;               // replace value for matching keys. (default: '***')
  ciKeys?: boolean;            // case-insensitive key matching. (default: false)
  partialMatch?: boolean;      // substring match for keys (e.g., containing 'token'). (default: false)
  maskMapKeys?: boolean;       // also mask Map keys. (default: false)
  maskTypedArrays?: boolean;   // replace typed arrays with placeholders. (default: false)
  includeInherited?: boolean;  // include inherited enumerable keys (own keys only). (default: false)
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

## 🎨 Format API (`log-sm/format`)

```ts
import { createConsoleFormatter } from 'log-sm/format';
```

```ts
const formatter = createConsoleFormatter('auto'); // 'off' | 'auto' | 'on'
```

- Adds timestamp + color automatically (TTY detection).
- Safe JSON serialization for payloads.
- Returns a `(level, msg, data)` formatter usable in `CreateLoggerOptions.consoleFormatter`.

---

## 🧣 Example Use Cases

### 1️⃣ Custom sinks for embedded apps

```ts
const { logger } = createLogger({
  sinks: { error: Homey.error, info: Homey.log },
  warnFallback: 'error'
});
```

### 2️⃣ No-op logger

```ts
const { logger } = createLogger({ sinks: null });
logger.debug('not printed');
```

### 3️⃣ Child logger with static tags

```ts
const base = createLogger().logger;
const api = base.child({ svc: 'api' });
api.info('Listening', { port: 8080 });
// { svc: 'api', port: 8080 }
```

### 4️⃣ Colorized console output

```ts
import { createConsoleFormatter } from 'log-sm/format';
createLogger({ consoleFormatter: createConsoleFormatter('on') });
```

---

## 🚀 Performance Tips

- Avoid `mask` and `truncate` unless necessary.
- Use `child()` for contextual metadata instead of re-merging objects.
- Each logger is a pre-compiled pipeline — hot path ~ `console.log` speed.

---

## ❓ FAQ

**Q:** Why not support printf-style templates?  
**A:** Simplicity and speed. Use structured data instead.

**Q:** Can I toggle debug at runtime?  
**A:** Yes — use `debugForMs(ms)` to enable temporary DEBUG visibility.

**Q:** Will it break on BigInt or circular objects?  
**A:** No — built-in formatters are JSON-safe and circular-tolerant.

---

## 📦 Install

```bash
npm i log-sm
# or
pnpm add log-sm
# or
yarn add log-sm
```

No peer dependencies. TypeScript types included.

---

## 🧬 License

MIT — © 2025 Huy Nguyen  
<https://huynguyen.net>

---

## 📘 More Examples & Recipes

See more practical patterns for customizing and extending **log-sm** without changing the core:

- [**USE_CASES.md**](./USE_CASES.md) — common real-world usage:
    - error input policies, console/custom sinks, JSON logging, redaction, deduplication, tags, and runtime debug.
- [**USE_CASES_ADV.md**](./USE_CASES_ADV.md) — advanced production patterns:
    - filtering by message pattern, grouped console logs, global error capture, remote debug toggles, performance timing, and bridging to external loggers.

---

