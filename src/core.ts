// src/core.ts
// Smart Minimal Logger (log-sm)
// - Zero-deps, tiny, predictable, fast.
// - Works on Node & browser.
// - Pluggable sinks or clean console fallback.
// - Strict level gating with special WARN policy.
// Author: Huy Nguyen, 2025 • MIT
//
// Multi-runtime notes:
// - This module is designed to run in Node, browsers, workers, SSR, and test runners.
// - Do NOT assume `process`, `console`, or timer APIs always exist:
//   - `process.env` may be unavailable (browser/worker). Use `options.env` for deterministic tests.
//   - `console` may be missing or partially implemented (some embedded/sandbox runtimes).
//   - `setTimeout/clearTimeout` may be missing in restricted runtimes.
// - The implementation uses `typeof ... !== 'undefined'` guards and duck-typing to avoid ReferenceError.
// - When a capability is missing (console/timers), the logger degrades gracefully (no-op or manual dispose).
//
// Non-goals (by design):
// - log-sm does NOT guarantee "logging never throws" for adversarial or exotic inputs
//   (revoked Proxy, throwing getters, broken polyfills, etc.).
// - This keeps the hot path tiny, fast, and predictable.
// - If you need fully crash-proof logging, sanitize inputs or wrap your `mask` with try/catch.

/* ---------------------------------- Types ---------------------------------- */

/**
 * Logging levels.
 */
export const LogLevel = {
    NONE: 0,
    ERROR: 1,
    INFO: 2,
    DEBUG: 3
} as const;
type LogLevel = typeof LogLevel[keyof typeof LogLevel]; // 0|1|2|3
type LogLevelName = 'error' | 'info' | 'debug' | 'none';

/**
 * Format a single console line. Must return a string message and structured payload.
 * The caller will pass them into console.* as (msg, data).
 */
export interface ConsoleFormatter {
    (level: 'error' | 'warn' | 'info' | 'debug', msg: string, data?: unknown): { msg: string; data?: unknown };
}

/**
 * Output function signature used by sinks.
 * The logger calls a sink with a final, display-ready message and an optional structured payload.
 * - `msg`: already prefixed/tagged if levelTags are set.
 * - `data`: already masked and/or truncated if those options are provided.
 */
export type Sink = (msg: string, data?: unknown) => void;

/**
 * The core logger interface.
 */
export interface ILogger {
    /**
     * Gets the current effective level.
     * - Base level is resolved from `CreateLoggerOptions.level` or environment
     *   (`DEBUG_MODE` → `LOG_LEVEL` → `NODE_ENV`) and `prodDefault`.
     * - The effective level can be temporarily overridden by `withLevel()` / `withLevelTimed()`.
     * Note: WARN uses its own gate (`warnLevel` - default ERROR), which can be visible even when `level=ERROR`.
     */
    readonly level: LogLevelName;

    /**
     * Log an error with either an Error instance or a string message.
     * - When passed an Error, it is normalized via `normalizeError()` and merged with `data` according to
     *   `errorStackPolicy`, `errorInputPolicy`, and `inputKey`.
     * - Stack inclusion follows `errorStackPolicy` and is also enabled while a temporary debug window
     *   is active (see `debugForMs()`).
     * - Gating: visible only when `level >= ERROR`.
     */
    error(msg: Error | string, data?: unknown): void;

    /**
     * Log a warning with optional structured data.
     * - Gating: controlled by `warnLevel` (default ERROR).
     *   Example:
     *   - warnLevel=ERROR => WARN is visible when effective `level >= ERROR` (even if INFO/DEBUG are off).
     *   - warnLevel=INFO  => WARN is visible only when effective `level >= INFO`.
     * Note: WARN is not a base level; it uses its own independent gate.
     */
    warn (msg: string, data?: unknown): void;

    /**
     * Log info with optional structured data.
     * - Gating: visible when `level >= INFO`.
     * - Also visible during a temporary debug window if `debugForMs(..., { allowInfo: true })` is active.
     */
    info (msg: string, data?: unknown): void;

    /**
     * Log debug with optional structured data.
     * - Gating: visible when `level >= DEBUG`, or while a temporary debug window is active
     *   (see `debugForMs()`), regardless of the current level.
     */
    debug(msg: string, data?: unknown): void;

    /**
     * Enable a temporary debug window for `ms` milliseconds.
     * - Requires `ms` to be a positive finite number; otherwise throws.
     * During the window:
     * - debug() is allowed regardless of the current level (without changing `level`).
     * - If `allowInfo === true`, info() is also allowed. (default: true)
     * - If `includeStack === true`, stack traces are included when logging Error. (default: true)
     * Returns a disposer to end early (idempotent).
     * Timers note (multi-environment):
     * - In runtimes without timers, timed overrides require manual dispose.
     * - If timers are missing, the override still applies but will not auto-expire.
     */
    debugForMs(ms: number, opts?: { allowInfo?: boolean, includeStack?: boolean }): () => void;

    /**
     * Scoped override: run `fn` under `level`, then restore the previous effective level.
     * Works with sync and async functions (restore happens in finally/Promise.finally).
     *
     * Async note:
     * - This uses `Promise.finally` when `fn` returns a Promise.
     * - If targeting very old JS engines without `Promise.finally`, ensure your build includes a polyfill
     *   or transpile appropriately.
     */
    withLevel<T>(level: LogLevel | LogLevelName, fn: (log: ILogger) => T | Promise<T>): T | Promise<T>;

    /**
     * Temporarily override (raise/lower) the level for `ms` milliseconds.
     * - Requires `ms` to be a positive finite number; otherwise throws.
     * Returns a disposer that can be called early (idempotent).
     * Overlapping overrides are supported (last-wins semantics).
     * Timers note (multi-environment):
     * - In runtimes without timers, timed overrides require manual dispose.
     * - If timers are missing, the override still applies but will not auto-expire.
     */
    withLevelTimed(level: LogLevel | LogLevelName, ms: number): () => void;

    /**
     * Create a sibling logger with static tags merged into structured data of every call.
     * Inexpensive wrapper that preserves the same level/sinks; use to stamp `service`, `module`, `tenant`, etc.
     */
    withTags(tags?: Record<string, string | number>): ILogger;

    /**
     * Create a separated child logger with options shallow-merged into the parent's options.
     * Notes:
     * - This is a shallow merge (`{ ...parentOpts, ...childOpts }`), not a deep merge.
     * - If the current logger is a tags wrapper (`withTags()`), tags are merged into `childOpts.tags`
     *   according to `mergeTagsPolicy`.
     */
    child(childOpts?: CreateLoggerOptions): ILogger;
}

export type CreateLoggerOptions = {
    /**
     * Optional custom sinks.
     * - If `sinks` is null => no-op logger (all levels ignored).
     * - If `sinks` is omitted => all levels fall back to console.*.
     * - If `sinks` is provided => the logger uses those sinks for provided levels.
     *   Missing warn/debug sinks according to warn/debug fallback rules.
     *   Missing info/error sinks fall back to console.*.
     * If `consoleFormatter` is provided, it is applied to any level that falls back to the console.*.
     * Default: no custom sinks (console fallback).
     */
    sinks?: {
        error?: Sink;
        warn?:  Sink;
        info?:  Sink;
        debug?: Sink;
    } | null;

    /**
     * Explicit base level for ERROR/INFO/DEBUG gating (WARN uses `warnLevel`).
     * If omitted, resolves from env:
     * - `DEBUG_MODE=1|TRUE|YES|ON` (case-insensitive) => DEBUG
     * - `LOG_LEVEL=NONE|ERROR|INFO|DEBUG|OFF|ERR|DBG|0..3` (case-insensitive)
     * - `LOG_LEVEL=WARN|WRN` (case-insensitive, special-case for `LOG_LEVEL` only) uses `warnLevel` as the base gate.
     * - Otherwise: `NODE_ENV=production` => `prodDefault` (default ERROR), else INFO.
     */
    level?: LogLevel | LogLevelName;

    /**
     * Optional level labels/prefixes (e.g., "[ERROR]", ...).
     * Applied to message text only (not to payload). Default: off.
     */
    levelTags?: {
        error?: string;
        warn?:  string;
        info?:  string;
        debug?: string;
    } | null;

    /**
     * Optional console formatter (prefix, color, JSON line, etc.).
     * Only used when sinks are NOT provided; custom sinks take precedence.
     */
    consoleFormatter?: ConsoleFormatter;

    /**
     * Separate gate for `warn()`.
     * Default: ERROR (WARN remains visible even when the base level is ERROR).
     * Set to INFO for conventional gating (WARN visible when base `level >= INFO`).
     */
    warnLevel?: LogLevel | LogLevelName;

    /**
     * Fallback path for WARN when a custom `sinks.warn` is not provided. ('sinks' null is no-op)
     * - 'console' (default): console.warn (or formatted console if `consoleFormatter`)
     * - 'error': reuse error sink
     * - 'info': reuse info sink
     * - 'debug': reuse debug sink
     * - 'ignore': drop output
     */
    warnFallback?: 'error' | 'info' | 'debug' | 'console' | 'ignore';

    /**
     * Fallback path for DEBUG when a custom `sinks.debug` is not provided. ('sinks' null is no-op)
     * - 'console' (default): console.debug() (or formatted console if `consoleFormatter`)
     * - 'info': reuse info sink
     * - 'ignore': drop output
     */
    debugFallback?: 'info' | 'console' | 'ignore';

    /**
     * Policy for including stack traces when logging Error.
     * - 'auto' (default): include stack unless `NODE_ENV=production`.
     * - 'always': always include stack when an Error is logged.
     * - 'never': never include stack.
     * Note: a temporary debug window (see `debugForMs`) forces stack inclusion during the window
     * when logging an Error (it affects Error normalization only).
     */
    errorStackPolicy?: 'auto' | 'always' | 'never';

    /**
     * How to merge the raw error input onto the error payload in `error()`.
     * Ex: `{ [inputKey]: input }`
     * - 'never': never attach the original input to payload
     * - 'ifNonError' (default): attach when input is not an instance of Error
     * - 'always': always attach (even if Error or anything else)
     */
    errorInputPolicy?: 'never' | 'ifNonError' | 'always';

    /**
     * Key name used to place non-Error inputs (e.g., a string) into the structured payload of `error()`.
     * Default: 'input'
     */
    inputKey?: string;

    /**
     * Shallow truncation for long string fields in `data` (and normalized Error payload).
     * - Value > 0 trims strings to the given length and appends "...[truncated]".
     * - Non-strings unaffected; BigInt is stringified; Node Buffer (if detected) is summarized.
     * Default: 0 (off).
     */
    truncate?: number;

    /**
     * Optional masker function for `data` and normalized errors.
     * Use to redact secrets or PII before output. Compose your own (e.g., makeMask(...)).
     */
    mask?: (value: unknown) => unknown;

    /**
     * Static tags merged into every log call as shallow key-values (cheap merge).
     * Useful for stamping `service`, `module`, `tenant`, etc.
     */
    tags?: Record<string, string | number>;

    /**
     * Merge order when applying tags at call time:
     * - 'dataWins' (default): `{ ...tags, ...data }`
     * - 'tagsWin'           : `{ ...data, ...tags }`
     */
    mergeTagsPolicy?: 'dataWins' | 'tagsWin'

    /**
     * Optional environment bag used for level resolving and stack policy.
     * Provide in tests or browser; defaults to `process.env` when available.
     */
    env?: Record<string, string | undefined>;

    /**
     * Default base level when `NODE_ENV=production` and no explicit `level` / `DEBUG_MODE` / `LOG_LEVEL` are provided.
     * Default: ERROR.
     */
    prodDefault?: LogLevel | LogLevelName;

    // /** Clock source for testing. Default: () => Date.now() */
    // now?: () => number;
};

/* ------------------------------ Error helpers ------------------------------ */

/**
 * Error detection (cross-realm friendly):
 * - `instanceof Error` can fail across realms (iframes/workers) or when errors come from different JS contexts.
 * - We use a small "error-like" duck-typing check for stable behavior across environments.
 */
function isErrorLike(e: unknown): e is Error & Record<string, unknown> {
    return !!e && typeof e === 'object'
        && typeof (e as any).message === 'string'
        && (typeof (e as any).name === 'string' || typeof (e as any).stack === 'string');
}

/**
 * Error normalization:
 * - Produces a small JSON-friendly object with stable fields across runtimes.
 * - Copies only enumerable own properties to avoid pulling huge/non-standard fields.
 * - Never overwrites `name`, `message`, or `stack`.
 */
function normalizeError(err: Error & Record<string, unknown>, includeStack: boolean): Record<string, unknown> {
    /**
     * Convert an Error into a small, JSON-friendly object.
     * - Always includes `name` and `message`.
     * - Includes `stack` when requested.
     * - Copies own enumerable custom fields (if any) but never overrides `name|message|stack`.
     * Intentionally tiny and predictable for stable logs across runtimes.
     */
    // Copy a few common fields; keep it tiny and predictable
    const out: Record<string, unknown> = { name: err.name || 'Error', message: err.message, };
    if (includeStack && typeof err.stack === 'string') out.stack = err.stack;

    // Copy own enumerable custom props (if any)
    const keys = Object.keys(err);
    for (const k of keys) {
        if (k === 'name' || k === 'message' || k === 'stack') continue;
        out[k] = (err as any)[k];
    }

    return out;
}

/* ------------------------------- Env helpers ------------------------------- */

/**
 * Runtime capability detection (multi-environment safe):
 * - Uses `globalThis` when available. Guarded to avoid ReferenceError in older engines.
 * - Never imports Node's Buffer to keep zero-deps and avoid bundler polyfills.
 * - `Buffer` may be absent (browser) or polyfilled (bundlers).
 * - `Buffer.isBuffer` may exist but not be a function in unusual setups.
 *
 * Design note:
 * - `Buffer.isBuffer` (native or polyfilled) is assumed to be safe.
 * - This check is NOT wrapped in try/catch to keep the hot path minimal.
 * - In the extremely rare case a polyfill throws internally, the exception will propagate.
 *   If you require "never throw from logging", sanitize inputs before logging.
 */
const GT: any = typeof globalThis !== 'undefined' ? globalThis : undefined;
const isBuffer = (v: unknown): v is { length: number } => {
    const bi = GT && GT.Buffer && GT.Buffer.isBuffer;
    return typeof bi === 'function' && bi(v);
};

function resolveLevel(
    optLevel: LogLevel | LogLevelName | undefined,
    warnLevel: LogLevel,
    env?: Record<string, string | undefined>,
    prodDefault?: LogLevel | LogLevelName,
): LogLevel {
    /**
     * Resolve the base logging level in the following order:
     * 1) Explicit `level`
     * 2) `DEBUG_MODE=1|true|yes|on` → DEBUG
     * 3) `LOG_LEVEL=<NONE|ERROR|INFO|DEBUG|0..3>` (special: 'WARN'|'WRN' means use `warnLevel` as the base gate)
     * 4) `NODE_ENV=production` → `prodDefault` (default ERROR), else INFO
     */

    // 1) explicit by `CreateLoggerOptions.level`
    const explicit = parseLogLevel(optLevel);
    if (explicit != null) return explicit;

    // 2) DEBUG_MODE
    const dm = env?.DEBUG_MODE?.trim().toLowerCase();
    if (dm === '1' || dm === 'true' || dm === 'yes' || dm === 'on') return LogLevel.DEBUG;

    // 3) LOG_LEVEL (with 'WARN' special)
    const w = env?.LOG_LEVEL?.trim().toUpperCase();
    const l = w && (w === 'WARN' || w === 'WRN') ? warnLevel : parseLogLevel(env?.LOG_LEVEL);
    if (l != null) return l;

    // 4) NODE_ENV
    return  env?.NODE_ENV?.trim().toLowerCase() === 'production' ? (parseLogLevel(prodDefault) ?? LogLevel.ERROR) : LogLevel.INFO;
}

function parseLogLevel(v?: number | string | null | undefined): LogLevel | undefined {
    /**
     * Resolve a string/number into a `LogLevel`.
     * Accepts (case-insensitive):
     * - 'none'|'error'|'info'|'debug'
     * - '0'…'3' (string) or 0..3 (number)
     * Returns `undefined` if unparsable; callers decide fallback behavior.
     * Note: 'WARN' is not a base level; use `warnLevel` to gate warn().
     */
    if (v == null) return undefined;

    if (typeof v === 'string') {
        const s = v.trim();
        if (!s) return undefined;
        switch (s.toUpperCase()) {
            case 'NONE' : case 'OFF': return LogLevel.NONE;
            case 'ERROR': case 'ERR': return LogLevel.ERROR;
            case 'INFO' :             return LogLevel.INFO;
            case 'DEBUG': case 'DBG': return LogLevel.DEBUG;
            // optional: accept "0"…"3" below
        }
    }
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? (Math.max(0, Math.min(3, n)) as LogLevel) : undefined;
}


/* ----------------------------- Data transformers --------------------------- */

const NULL_SINK: Sink = () => {};
const IDENTITY_STRING = (x: string) => x;

function wrap(lvl: 'error' | 'warn' | 'info' | 'debug', f: ConsoleFormatter, c: (m: any, d?: any) => void) {
    return (m: string, d?: unknown) => {
        const {msg, data} = f(lvl, m, d);
        if (data === undefined) c(msg);
        else c(msg, data);
    };
}

function levelTagFormat(levelTag: string | undefined): (m: string) => string {
    return levelTag ? (m: string) => `${levelTag} ${m}` : IDENTITY_STRING;
}

function getLevelName(level: LogLevel): LogLevelName {
    return level === LogLevel.DEBUG ? 'debug' : level === LogLevel.INFO ? 'info' : level === LogLevel.ERROR ? 'error' : 'none';
}

function truncateFields<T extends object>(obj: T, maxPerField = 4000): T {
    /**
     * Shallow truncation of long string fields in an object or array.
     * - Strings longer than `maxPerField` are sliced and post-fixed with "...[truncated]".
     * - BigInt is stringified to avoid JSON issues.
     * - Node Buffer (if present) is summarized as `[Buffer N bytes]`.
     *
     * Important (multi-runtime):
     * - Assumes standard JS object semantics.
     * - Does NOT guard against ultra-rare cases such as revoked Proxies,
     *   throwing getters, or exotic host objects.
     * - If such values are passed, an exception may occur.
     * - This is intentional to keep logging fast and predictable.
     */
    if (!obj || typeof obj !== 'object') return obj as T;
    if (!maxPerField || maxPerField <= 0) return obj as T;
    const clone: any = Array.isArray(obj) ? [...(obj as any)] : { ...(obj as any) };
    for (const k of Object.keys(clone)) {
        const v = clone[k];
        if (typeof v === 'bigint') clone[k] = v.toString();
        else if (typeof v === 'string' && v.length > maxPerField) clone[k] = v.slice(0, maxPerField) + '...[truncated]';
        else if (isBuffer(v)) clone[k] = `[Buffer ${v.length} bytes]`;
    }
    return clone;
}

// /* ------------------------- Build-time dynamic flag guard ------------------------- */
//
// /**
//  * Some bundlers inject __LOGSM_DYNAMIC_PRO__ for tree-shaking dynamic features.
//  * We must guard with typeof to avoid ReferenceError at runtime when missing.
//  */
// // eslint-disable-next-line @typescript-eslint/naming-convention
// declare const __LOGSM_DYNAMIC_PRO__: boolean;
// const DYNAMIC: boolean = (typeof __LOGSM_DYNAMIC_PRO__ !== 'undefined') ? __LOGSM_DYNAMIC_PRO__ : true;

/* --------------------------------- Factory --------------------------------- */

/**
 * Create a logger.
 * - If `sinks` is null => no-op logger.
 * - If `sinks` is provided => custom sinks are used for those levels only.
 * - Else fallback to console.* => console.error/info/warn/debug.
 * - If `consoleFormatter` is provided, it is applied to any level that falls back to the console.*.
 * Returns: the ILogger instance (maybe wrapped by `tags`).
 * Notes:
 * - `debugForMs()` is a method on the returned logger. During the window, debug logs are allowed
 *   regardless of the current level, and stack traces can be forced for Error normalization.
 */
/* @__PURE__ */
export function createLogger(options?: CreateLoggerOptions): ILogger
{
    const opts: CreateLoggerOptions = options ?? {};

    /**
     * Console fallback behavior (multi-environment):
     * - In standard Node/browsers, console methods exist: error/warn/info/debug.
     * - In some environments, `console` can be missing or only partially implemented.
     *   Examples: embedded JS engines, hardened sandboxes, or certain test runners.
     * - To avoid crashing at logger creation time, console calls should be guarded:
     *   - If a console method is missing, fall back to a no-op sink.
     *   - `console.debug` is not guaranteed; optionally fall back to `console.log` or no-op.
     *
     * Important: console fallback is expected not to throw in normal runtimes.
     * If a console shim throws (or is non-bindable), the behavior follows the "Non-goals" section above.
     */
    const C = (GT as any)?.console;
    const cError = (C && typeof C.error === 'function') ? C.error.bind(C) : NULL_SINK;
    const cWarn  = (C && typeof C.warn  === 'function') ? C.warn.bind(C)  : NULL_SINK;
    const cInfo  = (C && typeof C.info  === 'function') ? C.info.bind(C)  : NULL_SINK;
    const cDebug = (C && typeof C.debug === 'function') ? C.debug.bind(C) :
        (C && typeof C.log   === 'function') ? C.log.bind(C) : NULL_SINK;

    /**
     * Build sinks with the "formatter applies only to console fallbacks" rule.
     * Note:
     * - User-provided sinks / consoleFormatter are assumed to be well-behaved.
     *   Exceptions thrown by them will propagate (intentional for predictability).
     */
    const s = opts.sinks;
    const f = opts.consoleFormatter;
    let error: Sink;
    let warn: Sink;
    let info: Sink;
    let debug: Sink;
    if (s === null) {
        error = warn = info = debug = NULL_SINK; // No-op logger
    } else {
        error = s?.error ?? (f ? wrap('error', f, cError) : cError);
        info  = s?.info  ?? (f ? wrap('info', f, cInfo) : cInfo);

        const debugFallback = opts.debugFallback ?? 'console';
        debug = s?.debug ?? (
            debugFallback === 'console' ? (f ? wrap('debug', f, cDebug) : cDebug) :
            debugFallback === 'info'    ? info :
            NULL_SINK // ignore
        );

        const warnFallback = opts.warnFallback ?? 'console';
        warn = s?.warn ?? (
            warnFallback === 'console' ? (f ? wrap('warn', f, cWarn) : cWarn) :
            warnFallback === 'error'   ? error :
            warnFallback === 'info'    ? info :
            warnFallback === 'debug'   ? debug :
            NULL_SINK // ignore
        );
    }

    // Level labels
    const labels = opts.levelTags;
    const msgError = levelTagFormat(labels?.error);
    const msgWarn  = levelTagFormat(labels?.warn);
    const msgInfo  = levelTagFormat(labels?.info);
    const msgDebug = levelTagFormat(labels?.debug);

    /**
     * Data transform pipeline:
     * - Order: mask -> truncate (shallow).
     * - `mask` is user-provided and may throw; callers should ensure `mask` is safe.
     * - This logger intentionally does NOT catch exceptions from `mask` to avoid hiding programming errors.
     *   (If you prefer "never throw from logging", wrap your mask with a try/catch and return the input on error.)
     */
    const trans =
        opts.truncate
            ? (x: unknown) => truncateFields((opts.mask ? opts.mask(x) : x) as any, opts.truncate)
            : (opts.mask ?? ((x: unknown) => x));

    /**
     * Environment resolution:
     * - Prefer `options.env` for deterministic behavior (tests, browsers, SSR).
     * - Fallback to `process.env` only when `process` exists.
     * - Do NOT assume `process` exists outside Node. Always guard with `typeof process !== 'undefined'`.
     */
    const env = opts.env ?? ((GT as any)?.process?.env as
        | Record<string, string | undefined>
        | undefined);

    // Stack policy
    const stackPolicy = opts.errorStackPolicy ?? 'auto';
    const includeStack = stackPolicy === 'never' ? false : (stackPolicy === 'always' || /* auto: */ (env?.NODE_ENV ?? '').trim().toLowerCase() !== 'production');

    // Error payload policy
    const mergeTagsDataWins = !opts.mergeTagsPolicy || opts.mergeTagsPolicy === 'dataWins';
    const inputPolicy = opts.errorInputPolicy ?? 'ifNonError';
    const inputKey = opts.inputKey ?? 'input';

    // Determine the base level
    const warnLevel = parseLogLevel(opts.warnLevel) ?? LogLevel.ERROR;
    const baseLevel = resolveLevel(opts.level, warnLevel, env, opts.prodDefault);

    // Runtime state (overrides)
    let _state: RuntimeState = {
        tokens: [],
        baseLevel,
        level: baseLevel,
        inDebug: false,
        inDebugAllowInfo: false,
        inDebugIncludeStack: false,
    };

    /** Core primitive: recompute the current runtime state from the token stack. **/
    const recomputeState = () => {
        const tokens = _state.tokens;

        // Level: last level token wins
        let lvl: LogLevel | undefined;
        for (let i = tokens.length - 1; i >= 0; i--) {
            const t = tokens[i];
            if (t && t.level !== undefined) {
                lvl = t.level;
                break;
            }
        }
        _state.level = lvl ?? _state.baseLevel;

        // Debug flags: last debug token wins (scan from end)
        let dbgAllow = true;
        let dbgStack = true;
        let hasDbg = false;
        for (let i = tokens.length - 1; i >= 0; i--) {
            const t = tokens[i];
            if (t && t.debugWindow !== undefined) {
                hasDbg = true;
                dbgAllow = !!t.debugWindow.allowInfo;
                dbgStack = !!t.debugWindow.includeStack;
                break;
            }
        }
        _state.inDebug = hasDbg;
        _state.inDebugAllowInfo = hasDbg && dbgAllow;
        _state.inDebugIncludeStack = hasDbg && dbgStack;
    };

    /** Core primitive: push a level override, optional expiry; returns an idempotent disposer. */
    const pushOverride = (
        level?: LogLevel | LogLevelName,
        ms?: number,
        debug?: DebugWindowOpts
    ): () => void => {
        const tokens = _state.tokens;
        const entry: Token = { token: Symbol('lvl') };

        if (level !== undefined) entry.level = parseLogLevel(level) ?? LogLevel.NONE;
        else entry.debugWindow = { allowInfo: debug?.allowInfo ?? true, includeStack: debug?.includeStack ?? true, }

        tokens.push(entry);
        recomputeState();

        /**
         * Timer guard:
         * - `setTimeout`/`clearTimeout` are not guaranteed in all JS runtimes.
         * - If timers are missing, we do not auto-expire timed overrides; disposer still works.
         */
        const st = (GT && typeof (GT as any).setTimeout === 'function') ? (GT as any).setTimeout.bind(GT) : null;
        const ct = (GT && typeof (GT as any).clearTimeout === 'function') ? (GT as any).clearTimeout.bind(GT) : null;
        let disposed = false;

        if (ms && Number.isFinite(ms) && ms > 0 && st) {
            entry.timer = st(() => {
                if (disposed) return;
                disposed = true;
                const idx = tokens.findIndex(o => o.token === entry.token);
                if (idx >= 0) tokens.splice(idx, 1);
                recomputeState();
            }, ms);
        }

        return () => {
            if (disposed) return;
            disposed = true;
            if (entry.timer && ct) ct(entry.timer);
            const idx = tokens.findIndex(o => o.token === entry.token);
            if (idx >= 0) tokens.splice(idx, 1);
            recomputeState();
        };
    };


    // Create the core logger
    const api: ILogger = {
        get level() { return getLevelName(_state.level); },
        // set level(l: LogLevelName) {
        //     const level = parseLogLevel(l);
        //     if (level == null) return;
        //     if (_state.tokens.length > 0) {
        //         // When the override stack is active, setLevel changes the top entry
        //         const top = _state.tokens[_state.tokens.length - 1];
        //         if (top) top.level = level;
        //     }
        //     _state.level = level;
        // },
        error(err, data) {
            if (_state.level < LogLevel.ERROR) return;
            const isErr = isErrorLike(err);
            const msg = isErr ? err.message : (typeof err === 'string' ? err : '[non-string error]');
            const norm = isErr ? normalizeError(err, includeStack || _state.inDebug && _state.inDebugIncludeStack) : {};
            /**
             * Payload merge rule:
             * - Only merge "plain objects" (prototype is Object.prototype or null).
             * - Arrays, Dates, Errors, Maps/Sets, class instances, etc. are NOT merged via spread,
             *   because it can produce unpredictable results across runtimes.
             * - Non-plain values are wrapped under `{ data: value }` for stable, JSON-friendly logs.
             */
            const extra = isPlainObject(data)
                ? (data as Record<string, unknown>)
                : (data !== undefined ? { data } : {});
            const payload = isErr
                ? (inputPolicy === 'always' ? { [inputKey]: err, ...norm, ...extra } : /* ifNonError/never: */ { ...norm, ...extra })
                : (inputPolicy === 'never' ? { ...norm, ...extra } : /* ifNonError/always: */ { [inputKey]: err, ...extra });
            error(msgError(msg), trans(payload));
        },
        warn (msg, data) { if (_state.level >= warnLevel) warn(msgWarn(msg), trans(data)); },
        info (msg, data) { if (_state.level >= LogLevel.INFO  || _state.inDebug && _state.inDebugAllowInfo) info(msgInfo(msg), trans(data)); },
        debug(msg, data) { if (_state.level >= LogLevel.DEBUG || _state.inDebug) debug(msgDebug(msg), trans(data)); },
        debugForMs(ms, opts) {
            if (!Number.isFinite(ms) || ms <= 0) throw new Error("debugForMs requires a positive ms duration.");
            return pushOverride(undefined, ms, opts);
        },
        withLevelTimed(level, ms) {
            if (!Number.isFinite(ms) || ms <= 0) throw new Error("withLevelTimed requires a positive ms duration.");
            return pushOverride(level, ms);
        },
        withLevel<T>(level: LogLevel | LogLevelName, fn: (log: ILogger) => T | Promise<T>): T | Promise<T> {
            const dispose = pushOverride(level);
            try {
                const r = fn(api);
                if (r && typeof (r as any).then === 'function') {
                    return Promise.resolve(r as any).finally(dispose) as any;
                }
                dispose();
                return r as T;
            } catch (e) { dispose(); throw e; }
        },
        withTags(tags) { return tags ? withTags(api, tags, mergeTagsDataWins) : api; },
        child(childOpts) {
            const co : CreateLoggerOptions = childOpts ? { ...opts, ...childOpts } : { ...opts };
            return  createLogger(co);
        },
    };

    // Return the logger instance
    return opts.tags ? withTags(api, opts.tags, mergeTagsDataWins) : api;
}

/**
 * Build target notes:
 * - Uses `Symbol` for token identity. If targeting engines without Symbol, include a polyfill or change token strategy.
 * - If your emitted JS contains modern syntax (e.g., optional chaining in other variants), ensure it is transpiled
 *   to your supported runtime baseline.
 */
type Token = {
    token: symbol;
    level?: LogLevel;
    debugWindow?: DebugWindowOpts;

    // TS note: `ReturnType<typeof setTimeout>` depends on lib typings (dom/node).
    // Adjust if your TS lib config is minimal.
    timer?: any;
};


type DebugWindowOpts = {
    allowInfo?: boolean,
    includeStack?: boolean
};

type RuntimeState = {
    baseLevel: LogLevel;
    level: LogLevel; // Current effective level
    inDebug: boolean; // Debug window is active
    inDebugAllowInfo: boolean; // Debug window allows info level
    inDebugIncludeStack: boolean; // Debug window includes stack traces
    tokens: Token[]; // Stack of active level/debug overrides
};

/* ------------------------------ Child Factory ------------------------------ */

/**
 * Wrap an existing logger with static tags merged into every call's payload.
 * Merge policy:
 * - dataWins: `{ ...tags, ...data }`
 * - tagsWin: `{ ...data, ...tags }`
 * Cheap and allocation-light; suitable for stamping contextual fields at module or request scope.
 */
function withTags(
    base: ILogger,
    tags?: Record<string, string | number>,
    mergeTagsDataWins: boolean = true
): ILogger {
    if (!tags || Object.keys(tags).length === 0) return base;

    /**
     * Merge rule for payloads:
     * - undefined → just tags
     * - plain obj → spread fields
     * - other (string/number/array/Date/...) → place under { data: v } to avoid weird spreads
     */
    const merge = mergeTagsDataWins
        ? (data?: unknown) => data === undefined ? tags : isPlainObject(data) ? { ...tags, ...data } : { ...tags, data }
        : (data?: unknown) => data === undefined ? tags : isPlainObject(data) ? { ...data, ...tags } : { data, ...tags };

    const sibling: ILogger = {
        get level() { return base.level; },
        error(msg, data) { base.error(msg as any, merge(data)); },
        warn (msg, data) { base.warn (msg, merge(data)); },
        info (msg, data) { base.info (msg, merge(data)); },
        debug(msg, data) { base.debug(msg, merge(data)); },
        debugForMs: base.debugForMs,
        withLevel: base.withLevel,
        withLevelTimed: base.withLevelTimed,
        withTags(extra) {
            return extra ? withTags(
                sibling,
                mergeTagsDataWins ? { ...tags, ...extra } : { ...extra, ...tags },
                mergeTagsDataWins
            ) : sibling
        },
        child(childOpts) {
            const co = { ...(childOpts ?? {}) };
            const extra = co.tags;
            co.tags = extra ? (mergeTagsDataWins ? { ...tags, ...extra } : { ...extra, ...tags }) : tags;
            return base.child(co);
        },
    };

    return sibling;
}

/**
 * Plain object detection.
 *
 * Design note:
 * - Intentionally minimal and fast.
 * - Does NOT attempt to be crash-proof for revoked Proxies or exotic host objects.
 * - If Object.getPrototypeOf throws, the exception will propagate.
 * - This is a deliberate trade-off to keep logging lightweight.
 */
function isPlainObject(v: unknown): v is Record<string | number | symbol, unknown> {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
    const proto = Object.getPrototypeOf(v);
    return proto === Object.prototype || proto === null;
}
