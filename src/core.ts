// src/core.ts
// Smart Minimal Logger (log-sm)
// - Zero-deps, tiny, predictable, fast.
// - Works on Node & browser.
// - Pluggable sinks or clean console fallback.
// - Strict level gating with special WARN policy.
// Author: Huy Nguyen, 2025 • MIT

/* ---------------------------------- Types ---------------------------------- */

/**
 * Output function signature used by sinks.
 * The logger calls a sink with a final, display-ready message and an optional structured payload.
 * - `msg`: already prefixed/tagged if levelTags are set.
 * - `data`: already masked and/or truncated if those options are provided.
 */
export type Sink = (msg: string, data?: unknown) => void;

export const enum LogLevel {
    NONE = 0,
    ERROR = 1,
    INFO = 2,
    DEBUG = 3
}

export interface ILogger {
    /**
     * Gets the current effective level.
     * Specified or resolved from `CreateLoggerOptions.level` or environment (`DEBUG_MODE` → `LOG_LEVEL` → `NODE_ENV`) and `prodDefault`.
     * Note: WARN uses its own gate (`warnLevel` - default ERROR) so it can be visible even when `level=ERROR`.
     */
    readonly level: LogLevel;

    /** Set the runtime level. Returns true if changed. */
    setLevel(l: LogLevel): boolean;
    
    /**
     * Log an error with either an Error instance or a string message.
     * - When passed an Error, it is normalized via `normalizeError()` and merged with `data` according to
     *   `includeStack` and `inputKey`. Stack inclusion follows `errorStackPolicy` and is also enabled
     *   during a temporary debug window (see `debugForMs()`).
     * - Gating: visible when `level>=ERROR` or when a debug window is active.
     */
    error(msg: Error | string, data?: unknown): void;
    
    /**
     * Log a warning with optional structured data.
     * - Special gate: `warnLevel` (default ERROR) allows 'WARN' to show even when `level = ERROR`.
     *   Set `warnLevel = INFO` for conventional behavior (WARN visible when `level >= INFO`).
     */
    warn (msg: string, data?: unknown): void;
    
    /** Log info with optional structured data (visible when `level>=INFO`). */
    info (msg: string, data?: unknown): void;
    
    /**
     * Log debug with optional structured data.
     * - Gating: visible when `level >= DEBUG` or while `debugForMs()` is active for this logger instance.
     */
    debug(msg: string, data?: unknown): void;

    /**
     * Scoped override: run `fn` under `level`, then restore the previous effective level.
     * Works with sync & async functions (restore happens in finally/Promise.finally).
     */
    withLevel<T>(l: LogLevel, fn: () => T | Promise<T>): T | Promise<T>;

    /**
     * Temporarily override (raise/lower) the level for a duration (`ms` milliseconds).
     * Returns a disposer that can be called early (idempotent).
     * Overlapping overrides are supported (last-wins semantics).
     */
    withLevelTimed(level: LogLevel, ms: number): () => void;

    /**
     * Turn on DEBUG for `ms` milliseconds.
     * If `includeInfo === true`, info() is also allowed during the debug window.
     * Returns a disposer to end early.
     */
    debugForMs(ms: number, opts?: { includeInfo?: boolean }): () => void;

    /**
     * Create a child logger with static tags merged into structured data of every call.
     * Inexpensive wrapper that preserves the same level/sinks; use to stamp `service`, `module`, `tenant`, etc.
     */
    child(tags?: Record<string, string | number>): ILogger;
}

export interface ConsoleFormatter {
    /**
     * Format a single console line. Must return a string message and structured payload.
     * The caller will pass them into console.* as (msg, data).
     */
    (level: 'error' | 'warn' | 'info' | 'debug', msg: string, data?: unknown): { msg: string; data?: unknown };
}

// export type StackPolicy = 'auto' | 'always' | 'never';
//
// export type includeStack =
//     | 'never'      // never attach the original input to payload
//     | 'ifNonError' // attach when input is not an instance of Error
//     | 'always';    // always attach (even if Error or anything else)

export type CreateLoggerOptions = {
    /**
     * Optional custom sinks.
     * If provided, the logger calls those sinks with (msg, data).
     * Else fallback to console.* => console.log, console.warn, console.error, console.debug.
     * If `consoleFormatter` is provided AND no custom sinks, the console output is a single formatted line.
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
     * - `DEBUG_MODE=1|true|yes|on` => DEBUG
     * - `LOG_LEVEL=NONE|ERROR|INFO|DEBUG|0..3`
     * - Otherwise: `NODE_ENV=production` => `prodDefault` (default ERROR), else INFO.
     */
    level?: LogLevel;
    
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
     * Separate gate for `warn()`.
     * Default: ERROR (WARN remains visible even when the base level is ERROR).
     * Set to INFO for conventional gating (WARN visible when base `level >= INFO`).
     */
    warnLevel?: LogLevel;
    
    /**
     * Fallback path for WARN when a custom `sinks.warn` is not provided.
     * - 'console' (default): console.warn (or formatted console if `consoleFormatter`)
     * - 'error': reuse error sink
     * - 'info': reuse info sink
     * - 'debug': reuse debug sink
     * - 'ignore': drop output
     */
    warnFallback?: 'error' | 'info' | 'debug' | 'console' | 'ignore';
    
    /**
     * Fallback path for DEBUG when a custom `sinks.debug` is not provided.
     * - 'console' (default): console.debug() (or formatted console if `consoleFormatter`)
     * - 'info': reuse info sink
     * - 'ignore': drop output
     */
    debugFallback?: 'info' | 'console' | 'ignore';
    
    /**
     * How to merge the raw error input onto the error payload in `error()`.
     * - 'auto' (default): if input is NOT an Error => include `{ [inputKey]: input }`.
     * - 'always': always include `{ [inputKey]: input }`.
     * - 'never': never include input (payload contains only normalized Error + data).
     */
    includeStack?:
        | 'never'      // never attach the original input to payload
        | 'ifNonError' // attach when input is not an instance of Error
        | 'always';    // always attach (even if Error or anything else)
    
    /**
     * Policy for including stack traces when logging Error.
     * - 'auto' (default): include stack unless `NODE_ENV=production`.
     * - 'always': always include stack when an Error is logged.
     * - 'never': never include stack.
     * Note: a temporary debug window (see `debugForMs`) forces stack inclusion during the window.
     */
    errorStackPolicy?: 'auto' | 'always' | 'never';

    /**
     * Key name used to place non-Error inputs (e.g., a string) into the structured payload of `error()`.
     * Default: 'input'
     */
    inputKey?: string;
    
    /**
     * Optional console formatter (prefix, color, JSON line, etc.).
     * Only used when sinks are NOT provided; custom sinks take precedence.
     */
    consoleFormatter?: ConsoleFormatter;
    
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
    prodDefault?: LogLevel;

    /** Clock source for testing. Default: () => Date.now() */
    now?: () => number;
};

/* ------------------------------ Error helpers ------------------------------ */

// /** Narrow check for Error-like objects */
// function isErrorLike(e: unknown): e is Error & Record<string, unknown> {
//     return !!e && typeof e === 'object' && ('name' in e) && ('message' in e);
// }

/** Fast-ish error-like detection */
function isErrorLike(e: unknown): e is Error & Record<string, unknown> {
    return !!e && typeof e === 'object' && ('message' in (e as any));
}

/**
 * Convert an Error into a small, JSON-friendly object.
 * - Always includes `name` and `message`.
 * - Includes `stack` when requested.
 * - Copies own enumerable custom fields (if any) but never overrides `name|message|stack`.
 * Intentionally tiny and predictable for stable logs across runtimes.
 */
function normalizeError(err: Error & Record<string, unknown>, includeStack: boolean): Record<string, unknown> {
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

// // Global helpers (safe for browser and Node without @types/node)
// // const GT: any = (typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global));
// const GT: any = typeof globalThis !== 'undefined' ? globalThis : undefined;
// const hasNodeBuffer = !!GT?.Buffer?.isBuffer;
//
// /** Single check function to keep the bundle small. */
// const isBuffer = (v: unknown): v is { length: number } => hasNodeBuffer && GT.Buffer.isBuffer(v);

/** Buffer-like detection (Node) — fall back safe in browser */
function isBuffer(v: unknown): v is { length: number } {
    // Avoid importing Buffer to keep zero-deps; duck-typing length
    return !!v && typeof v === 'object' && 'length' in (v as any) && typeof (v as any).length === 'number'
        && Object.prototype.toString.call(v) === '[object Uint8Array]';
}

/**
 * Resolve a string/number into a `LogLevel`.
 * Accepts: 'NONE'|'ERROR'|'INFO'|'DEBUG' or a 0..3 number as string.
 * Returns `undefined` if unparsable; callers decide fallback behavior.
 * Note: 'WARN' is not a base level; use `warnLevel` to gate warn().
 */
function parseLogLevel(s?: string): LogLevel | undefined {
    if (!s) return undefined;
    switch (s.trim().toUpperCase())
    {
        case 'NONE': return LogLevel.NONE;
        case 'ERROR': return LogLevel.ERROR;
        case 'INFO': return LogLevel.INFO;
        case 'DEBUG': return LogLevel.DEBUG;
    }
    //if (v in LogLevel && typeof (LogLevel as any)[v] === 'number') return (LogLevel as any)[v];
    const n = Number(s);
    return Number.isFinite(n) ? (Math.max(0, Math.min(3, n)) as LogLevel) : undefined;
}

/**
 * Resolve the base logging level in the following order:
 * 1) Explicit `level`
 * 2) `DEBUG_MODE=1|true|yes|on` → DEBUG
 * 3) `LOG_LEVEL=<NONE|ERROR|INFO|DEBUG|0..3>` (special: 'WARN' means use `warnLevel` as the base gate)
 * 4) `NODE_ENV=production` → `prodDefault` (default ERROR), else INFO
 */
function resolveLevel(
    explicit: LogLevel | null | undefined,
    warnLevel: LogLevel,
    env?: Record<string, string | undefined>,
    prodDefault?: LogLevel,
): LogLevel {
    // 1) explicit by `CreateLoggerOptions.level`
    if (explicit != null) return explicit;
    
    // 2) DEBUG_MODE
    const dm = env?.DEBUG_MODE?.trim().toLowerCase();
    if (dm === '1' || dm === 'true' || dm === 'yes' || dm === 'on') return LogLevel.DEBUG;
    
    // 3) LOG_LEVEL (with 'WARN' special)
    const level = env?.LOG_LEVEL?.trim().toUpperCase() === 'WARN' ? warnLevel : parseLogLevel(env?.LOG_LEVEL);
    if (level != null) return level;
    
    // 4) NODE_ENV
    return  env?.NODE_ENV?.trim().toLowerCase() === 'production' ? (prodDefault ?? LogLevel.ERROR) : LogLevel.INFO;
}

/* ----------------------------- Data transformers --------------------------- */

/**
 * Shallow truncation of long string fields in an object or array.
 * - Strings longer than `maxPerField` are sliced and post-fixed with "...[truncated]".
 * - BigInt is stringified to avoid JSON issues.
 * - Node Buffer (if present) is summarized as `[Buffer N bytes]`.
 * - Returns a shallow clone on success; returns the original value if cloning fails.
 * Use this to keep logs small and predictable.
 */
function truncateFields<T extends object>(obj: T, maxPerField = 4000): T {
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

    const isPlainObject = (v: unknown): v is Record<string | number | symbol, unknown> =>
        v !== null && typeof v === 'object' && !Array.isArray(v);

    // Merge rule for payloads:
    // - undefined → just tags
    // - plain obj → spread fields
    // - other (string/number/array/Date/...) → place under { data: v } to avoid weird spreads
    const merge = mergeTagsDataWins
        ? (data?: unknown) => data === undefined ? tags : isPlainObject(data) ? { ...tags, ...data } : { ...tags, data }
        : (data?: unknown) => data === undefined ? tags : isPlainObject(data) ? { ...data, ...tags } : { data, ...tags };

    return {
        get level() { return base.level; },
        setLevel: base.setLevel,
        withLevel: base.withLevel,
        withLevelTimed: base.withLevelTimed,
        debugForMs: base.debugForMs,
        error(msg, data) { base.error(msg as any, merge(data)); },
        warn (msg, data) { base.warn (msg, merge(data)); },
        info (msg, data) { base.info (msg, merge(data)); },
        debug(msg, data) { base.debug(msg, merge(data)); },

        // For child, we must combine TAGS with EXTRA TAGS directly (not via mergePayload);
        // otherwise 'extra' could be wrapped into { data: ... } accidentally.
        child: (extra?: Record<string, string | number>) => extra ? withTags(
            base,
            mergeTagsDataWins ? { ...tags, ...extra } : { ...extra, ...tags },
            mergeTagsDataWins
        ) : base
    };
}

// function formatLine(prefix: string, levelTag: string, msg: string): string {
//     // No ANSI here by default; keep it runtime-agnostic and tiny.
//     return prefix ? `${prefix} ${levelTag} ${msg}` : `${levelTag} ${msg}`;
// }

// /** Safe “maybe redact then maybe truncate” transform */
// function makeTransform(opts: CreateLoggerOptions): (x: unknown) => unknown {
//     const mask = opts.mask ?? ((x: unknown) => x);
//     const max = opts.truncate;
//     if (!max || max <= 0) {
//         return (x) => mask(x);
//     }
//     return (x) => {
//         const v = mask(x);
//         if (v && typeof v === 'object') return truncateFields(v as any, max);
//         return v;
//     };
// }

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
 * - If `sinks` are provided => custom sinks are used for those levels only.
 * - Else fallback to console.* => console.log, console.warn, console.error, console.debug.
 * - If `consoleFormatter` is provided, it is applied to any level that falls back to console.*.
 *
 * Returns:
 * - `logger`: the ILogger instance (maybe wrapped by `tags`).
 * - `includeStack`: whether stacks are currently included for Error normalization (derived from policy/env).
 * - `debugForMs()`: enable a per-instance DEBUG window (also forces stack inclusion during the window).
 */
/* @__PURE__ */
export function createLogger(options?: CreateLoggerOptions): ILogger
// {
//     logger: ILogger;
//     includeStack: boolean,
//     /**
//      * Enable DEBUG outputs on this logger instance for `ms` milliseconds, then auto-restore.
//      * While active:
//      * - `debug()` is always printed regardless of base `level`.
//      * - `error()` normalization includes `stack` even if the current policy/env omits it.
//      * Use this to temporarily surface traces without changing global env.
//      */
//     debugForMs: (ms: number) => void
// }
{
    const opts: CreateLoggerOptions = options ?? {};
    
    // Build sinks with the "formatter applies only to console fallbacks" rule
    const s = opts.sinks;
    const f = opts.consoleFormatter;
    const nullSink: Sink = () => {};
    let error: Sink;
    let warn: Sink;
    let info: Sink;
    let debug: Sink;
    if (s === null) {
        // No-op logger
        error = warn = info = debug = nullSink;
    } else {
        // // error
        // if (s?.error) error = s.error;
        // else if (f)   error = (m, d) => { const r = f('error', m, d); console.error(r.msg, r.data); };
        // else          error = console.error.bind(console);
        //
        // // info
        // if (s?.info) info = s.info;
        // else if (f)  info = (m, d) => { const r = f('info', m, d); console.info(r.msg, r.data); };
        // else         info = console.info.bind(console);
        //
        // // debug
        // const debugFallback = opts.debugFallback ?? 'console';
        // if (s?.debug)                         debug = s.debug;
        // else if (debugFallback === 'console') debug = f ? (m, d) => { const r = f('debug', m, d); console.debug(r.msg, r.data); } : console.debug.bind(console);
        // else if (debugFallback === 'info')    debug = info;
        // else                                  debug = nullSink;}
        //
        // // warn
        // const warnFallback = opts.warnFallback ?? 'console';
        // if (s?.warn)                         warn = s.warn;
        // else if (warnFallback === 'console') warn = f ? (m, d) => { const r = f('warn', m, d); console.warn(r.msg, r.data); } : console.warn.bind(console);
        // else if (warnFallback === 'error')   warn = error;
        // else if (warnFallback === 'info')    warn = info;
        // else if (warnFallback === 'debug')   warn = debug;
        // else                                 warn = nullSink;

        
        error = s?.error ?? (f ? (m, d) => { const r = f('error', m, d); console.error(r.msg, r.data); } : console.error);
        info  = s?.info  ?? (f ? (m, d) => { const r = f('info', m, d); console.info(r.msg, r.data); } : console.info);

        const debugFallback = opts.debugFallback ?? 'console';
        debug = s?.debug ?? (
            debugFallback === 'console' ? (f ? (m, d) => { const r = f('debug', m, d); console.debug(r.msg, r.data); } : console.debug) :
            debugFallback === 'info'    ? info :
            nullSink // ignore
        );

        const warnFallback = opts.warnFallback ?? 'console';
        warn = s?.warn ?? (
            warnFallback === 'console' ? (f ? (m, d) => { const r = f('warn', m, d); console.warn(r.msg, r.data); } : console.warn) :
            warnFallback === 'error'   ? error :
            warnFallback === 'info'    ? info :
            warnFallback === 'debug'   ? debug :
            nullSink // ignore
        );
    }

    // Get the environment bag
    const env = opts.env ?? ((typeof process !== 'undefined' ? process.env : undefined) as
        | Record<string, string | undefined>
        | undefined);
    
    // Determine the base level
    const warnLevel = opts.warnLevel ?? LogLevel.ERROR;
    const baseLevel = resolveLevel(opts.level, warnLevel, env, opts.prodDefault);

    // Level labels
    const labels = opts.levelTags;
    const fmt = (tag?: string) => tag ? (m: string) => `${tag} ${m}` : (m: string) => m;
    const msgError = fmt(labels?.error);
    const msgWarn  = fmt(labels?.warn);
    const msgInfo  = fmt(labels?.info);
    const msgDebug = fmt(labels?.debug);

    // Transform pipeline: mask -> truncate (shallow)
    const mask = opts.mask;
    const trans = opts.truncate ? (x: unknown) => truncateFields((mask ? mask(x) : x) as any, opts.truncate) : mask ?? ((x) => x);

    // Stack policy
    const stackPolicy = opts.errorStackPolicy ?? 'auto';
    const includeStack = stackPolicy === 'never' ? false : (stackPolicy === 'always' || /* auto: */ (env?.NODE_ENV ?? '').trim().toLowerCase() !== 'production');

    // Error payload policy
    const mergeTagsDataWins = !opts.mergeTagsPolicy || opts.mergeTagsPolicy === 'dataWins';
    const inputPolicy = opts.includeStack ?? 'ifNonError';
    const inputKey = opts.inputKey ?? 'input';

    // Runtime state (overrides)
    let _level = baseLevel;
    let _overrides: LevelToken[] = [];
    let _overrideUntil = 0;
    let _inDebugWindowAllowInfo = false;
    
    type LevelToken = { token: symbol; level: LogLevel; timer?: ReturnType<typeof setTimeout> };
    const now = opts.now ?? (() => Date.now());
    const recomputeLevel = () => {
        const top = _overrides[_overrides.length - 1];
        _level = top ? top.level : baseLevel;
    };

    /** Core primitive: push a level override, optional expiry; returns an idempotent disposer. */
    const pushOverride = (l: LogLevel, ms?: number): () => void => {
//        if (!DYNAMIC) return () => {};
        const token = Symbol('lvl');
        const entry: LevelToken = { token, level: l };
        let disposed = false;
        _overrides.push(entry);
        _level = l;

        if (ms && Number.isFinite(ms) && ms > 0) {
            const deadline = now() + ms;
            _overrideUntil = Math.max(_overrideUntil, deadline);

            entry.timer = setTimeout(() => {
                if (disposed) return;
                disposed = true;
                // remove our token
                const idx = _overrides.findIndex(o => o.token === token);
                if (idx >= 0) _overrides.splice(idx, 1);

                // collapse window if no other future windows
                if (now() >= _overrideUntil) _overrideUntil = 0;
                recomputeLevel();
            }, ms);
        }

        return () => {
            if (disposed) return;
            disposed = true;
            if (entry.timer) clearTimeout(entry.timer);
            const idx = _overrides.findIndex(o => o.token === token);
            if (idx >= 0) _overrides.splice(idx, 1);
            if (_overrides.length === 0) _overrideUntil = 0;
            recomputeLevel();
        };
    };

    // // Helpers to compute includeStack
    // const shouldIncludeStack = (explicit: StackPolicy, inWindow: boolean) => {
    //     if (explicit === 'always') return true;
    //     if (explicit === 'never')  return false;
    //     // auto: include if in window to help debugging, else false
    //     return inWindow;
    // };
    //
    // // Stable payload builder (same key order helps IC stability)
    // function buildErrorPayload(
    //     input: unknown,
    //     data: unknown,
    //     errNormalized: { name: string; message: string; stack?: string } | undefined,
    //     policy: includeStackincludeStack
    // ): { input?: unknown; data?: unknown; name?: string; message?: string; stack?: string } {
    //     const out: { input?: unknown; data?: unknown; name?: string | undefined; message?: string | undefined; stack?: string | undefined } = {
    //         input: undefined,
    //         data:  undefined,
    //         name:  undefined,
    //         message: undefined,
    //         stack: undefined
    //     };
    //
    //     // Attach normalized error fields if available
    //     if (errNormalized) {
    //         out.name = errNormalized.name;
    //         out.message = errNormalized.message;
    //         if (errNormalized.stack) out.stack = errNormalized.stack;
    //     }
    //
    //     // Attach input according to policy
    //     if (policy === 'always') out.input = input;
    //     else if (policy === 'ifNonError' && !(input instanceof Error)) out.input = input;
    //
    //     if (data !== undefined) out.data = data;
    //
    //     return out;
    // }

    // Create the core logger
    const api: ILogger = {
        get level() { return _level; },
        setLevel: (l: LogLevel) => {
//            if (!DYNAMIC) return false;
            if (_overrides.length > 0) {
                // When the override stack is active, setLevel changes the top entry
                const top = _overrides[_overrides.length - 1];
                if (top) {
                    if (top.level === l) return false;
                    top.level = l;
                }
                _level = l;
                return true;
            }
            if (_level === l) return false;
            _level = l;
            return true;
        },
        withLevel<T>(level: LogLevel, fn: () => T | Promise<T>): T | Promise<T> {
//            if (!DYNAMIC) return fn(); // stripped in lite build
            const dispose = pushOverride(level);
            try {
                const r = fn();
                if (r && typeof (r as any).then === 'function') {
                    return (r as Promise<T>).finally(dispose);
                }
                dispose();
                return r as T;
            } catch (e) { dispose(); throw e; }
        },
        withLevelTimed(level: LogLevel, ms: number): () => void {
//            if (!DYNAMIC) return () => {}; // stripped in lite build
            return pushOverride(level, ms);
        },
        debugForMs(ms: number, opts?: { includeInfo?: boolean }): () => void {
//            if (!DYNAMIC) return () => {}; // stripped in lite build
            const prev = _inDebugWindowAllowInfo;
            if (opts?.includeInfo) _inDebugWindowAllowInfo = true;
            const disposeLevel = pushOverride(LogLevel.DEBUG, ms);
            return () => {
                disposeLevel();
                _inDebugWindowAllowInfo = prev;
            };
        },
        error: (err: any, data?: unknown) => {
            if (_level < LogLevel.ERROR) return;
            const isErr = isErrorLike(err);
            const msg = isErr ? err.message : (typeof err === 'string' ? err : '[non-string error]');
            const norm = isErr ? normalizeError(err, includeStack || _overrideUntil > 0) : {};
            const extra = (data !== null && typeof data === 'object' && !Array.isArray(data))
                ? (data as Record<string, unknown>)
                : (data !== undefined ? { data } : {});
            const payload = isErr
                ? (inputPolicy === 'always' ? { [inputKey]: err, ...norm, ...extra } : /* ifNonError/never: */ { ...norm, ...extra })
                : (inputPolicy === 'never' ? { ...norm, ...extra } : /* ifNonError/always: */ { [inputKey]: err, ...extra });
            error(msgError(msg), trans(payload));
        },
        warn (msg, data) { if (_level >= warnLevel) warn(msgWarn(msg), trans(data)); },
        info (msg, data) { if (_level == LogLevel.INFO || _level == LogLevel.DEBUG && (_overrideUntil == 0 || _inDebugWindowAllowInfo)) info(msgInfo(msg), trans(data)); },
        debug(msg, data) { if (_level >= LogLevel.DEBUG) debug(msgDebug(msg), trans(data)); },
        child(tags) { return tags ? withTags(api, tags, mergeTagsDataWins) : api; },
    };
    
    // Return the logger instance
    return opts.tags ? withTags(api, opts.tags, mergeTagsDataWins) : api;
    
    // return {
    //     logger: opts.tags ? withTags(core, opts.tags, mergeTagsDataWins) : core,
    //     includeStack,
    //     debugForMs: (ms: number) => {
    //         if (to) clearTimeout(to);
    //         instanceDebug = true;
    //         to = setTimeout(() => { instanceDebug = false; to = null },
    //             Math.max(0, Number.isFinite(ms) ? ms : 0));
    //     }
    // };
}
