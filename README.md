[![npm version](https://img.shields.io/npm/v/log-sm.svg?style=flat-square)](https://www.npmjs.com/package/log-sm)
[![bundle size](https://img.shields.io/bundlephobia/minzip/log-sm?style=flat-square)](https://bundlephobia.com/result?p=log-sm)
[![license](https://img.shields.io/github/license/huysrc/log-sm?style=flat-square)](./LICENSE)

# 🪶 log-sm — Smart Minimal Logger

A **zero-deps**, tiny, predictable logger for **Node + Browser**.

>✨ Why log-sm?
>`createLogger()` resolves configuration once and returns a specialized instance.
>

**Core ideas**
- 🧠 **Factory-first**: resolve config once → fast hot-path (close to `console.*` speed), no globals.  
- ⚠️ **WARN is independent**: controlled by `warnLevel` (not a base level).
- 🔌 **Pluggable sinks** (file/HTTP/OTel/etc.) with clean **console fallback**.
- 🔒 Optional **mask (redact)** + **truncate** pipeline.
- ⏱️ Runtime toggles: `debugForMs`, `withLevel`, `withLevelTimed`.
- 🤝 Works across runtimes (Homey, Node, browsers, workers, SSR, test runners)

> Design note: `log-sm` is tiny-first and predictable.  
> It does **not** guarantee “logging never throws” under exotic/adversarial inputs (revoked Proxy, throwing getters, broken polyfills).  
> If you need “never throw”, sanitize inputs or wrap `mask()` with try/catch.


## 📦 Install

```bash
npm i log-sm
# yarn add log-sm
# pnpm add log-sm
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


## ⚙️ Levels & the WARN rule

Base levels: `error | info | debug`  
`warn()` is **special**: visibility is controlled by `warnLevel` (default: `error`).

```ts
const log = createLogger({ level: 'error' });

log.warn('visible by default'); // warnLevel defaults to 'error'
log.info('not visible');
```

Want “traditional” behavior (WARN only when INFO is enabled)?

```ts
const log = createLogger({ level: 'error', warnLevel: 'info' });
log.warn('not visible now');
```

## 🔌 Sinks (console fallback)

- `sinks: undefined` → uses console (`console.error/warn/info/debug`)
- `sinks: null` → no-op (drop everything)
- `sinks: { ... }` → use your sinks; missing `warn/debug` follow fallbacks

> If a custom sink is provided, it takes precedence over `consoleFormatter`.

Example custom sink:

```ts
const log = createLogger({
  sinks: {
    info: (e) => fetch('/log', { method: 'POST', body: JSON.stringify(e) }),
  },
});
```

## 🔒 Redaction + truncation (opt-in)

Order: **mask → truncate**

```ts
import { createLogger } from 'log-sm';
import { makeMask } from 'log-sm/redact';

const log = createLogger({
  mask: makeMask(),  // uses DEFAULT_MASK_KEYS
  truncate: 2000,    // clamp long strings
});

log.info('login', { user: 'a', password: 'secret', token: 'abc' });
```

`log-sm/redact` is cycle-safe, depth-limited, and handles `Error`, `Map/Set`, typed arrays, Buffer.

## 🧩 Tags & child loggers

```ts
const log = createLogger({ tags: { service: 'api' } });

const auth = log.withTags({ module: 'auth' });
auth.warn('invalid credentials', { userId: 123 });

const noisy = log.child({ level: 'debug' });
noisy.debug('enabled here');
```

## ⏱️ Runtime debug controls

Debug window:

```ts
const log = createLogger({ level: 'error' });

const stop = log.debugForMs(10_000, { allowInfo: true, includeStack: true });
log.debug('visible during window');
stop(); // idempotent
```

Scoped override:

```ts
await log.withLevel('debug', async (l) => {
  l.debug('inside scope');
});
```

Timed override:

```ts
const dispose = log.withLevelTimed('debug', 5000);
dispose();
```

> In runtimes without timers, timed overrides won’t auto-expire (manual dispose still works).

---

## 🌱 Env-based level resolution (optional)

If `options.level` is omitted, base level resolves from:
1) `DEBUG_MODE=1|true|yes|on` → `debug`
2) `LOG_LEVEL=NONE|ERROR|INFO|DEBUG|OFF|ERR|DBG|0..3`
  - Special case: `LOG_LEVEL=WARN|WRN` → base level becomes `warnLevel`
3) Otherwise:
  - `NODE_ENV=production` → `prodDefault` (default: `error`)
  - else → `info`

>Tip: pass `options.env` (recommended for tests/browser/SSR) instead of relying on `process.env`.

---

## 📚 Modules

- `log-sm` → `createLogger()`
- `log-sm/redact` → `makeMask`, `redact`, `extendDefaultMaskKeys`
- `log-sm/format` → `createConsoleFormatter`

---

## 📖 Docs & examples

- [**USE_CASES.md**](./USE_CASES.md) — practical patterns (console/custom sinks, tags, runtime debug, redaction…)
- [**USE_CASES_ADV.md**](./USE_CASES_ADV.md) — advanced production patterns (filtering, remote toggles, perf timing, bridging…)

---

## ✎ᝰ. License

MIT — © 2026 [⋆⋅☆⋅⋆ HuySrc ⋆⋅☆⋅⋆](https://huynguyen.net) ദ്ദി(•̀ ᗜ <)
