// import {ILogger, LogLevel} from "./core";
//
// type LevelOverride = { token: symbol; level: LogLevel; timer?: ReturnType<typeof setTimeout> };
//
// class Logger implements ILogger {
//     /* ----------------------------- Construction ----------------------------- */
//
//     private readonly _now: () => number;
//
//     // Instance debug window
//     private _instanceDebugUntil: number = 0;
//     private _instanceDebugIncludeInfo: boolean;
//
//     // Level overrides stack (last-wins). Tokens allow timed disposers out-of-order.
//     private _overrides: LevelOverride[] = [];
//
//     constructor(private readonly base: ILogger, opts?: { now?: () => number, instanceDebugMs?: number, includeInfoInInstanceDebug?: boolean }) {
//         this._now = opts?.now ?? (() => Date.now());
//
//         if (opts?.instanceDebugMs && opts.instanceDebugMs > 0) {
//             this._instanceDebugUntil = this._now() + opts.instanceDebugMs;
//         }
//         this._instanceDebugIncludeInfo = !!opts?.includeInfoInInstanceDebug;
//     }
//
//     /* --------------------------------- Levels -------------------------------- */
//
//     /** Effective level after applying overrides (last-wins) or base level. */
//     public get level(): LogLevel {
//         const top = this._overrides[this._overrides.length - 1];
//         return top ? top.level : this.base.level;
//     }
//
//     /** Change base level (does not clear overrides). */
//     public set level(level: LogLevel) {
//         this.base.level = level;
//     }
//
//     /** Helper: is the temporary instance-debug window active? */
//     private _isInstanceDebugActive(): boolean {
//         return this._now() < this._instanceDebugUntil;
//     }
//
//     /**
//      * Scoped override of the effective level around `fn`. Restores previous override in all cases.
//      * Nesting is supported (LIFO). For cross-timer overlaps, prefer withLevelTimed.
//      */
//     public withLevel<T>(level: LogLevel, fn: () => T | Promise<T>): T | Promise<T> {
//         const token = Symbol('lvl-scope');
//         this._overrides.push({ token, level });
//
//         const restore = () => {
//             const i = this._overrides.findIndex(o => o.token === token);
//             if (i >= 0) this._overrides.splice(i, 1);
//         };
//
//         try {
//             const r = fn();
//             if (r && typeof (r as any).then === 'function') {
//                 return (r as Promise<T>).finally(restore);
//             }
//             restore();
//             return r as T;
//         } catch (e) {
//             restore();
//             throw e;
//         }
//     }
//
//     /**
//      * Time-bound override of the effective level. Overlaps are supported; last-wins.
//      * Returns an idempotent disposer to end the override early.
//      */
//     public withLevelTimed(level: LogLevel, ms: number): () => void {
//         if (!Number.isFinite(ms) || ms <= 0) return () => { /* no-op */ };
//
//         const token = Symbol('lvl-timed');
//         let disposed = false;
//
//         const entry: LevelOverride = { token, level };
//         this._overrides.push(entry);
//
//         entry.timer = setTimeout(() => {
//             if (disposed) return;
//             disposed = true;
//             this._removeOverrideByToken(token);
//         }, ms);
//
//         return () => {
//             if (disposed) return;
//             disposed = true;
//             if (entry.timer) clearTimeout(entry.timer);
//             this._removeOverrideByToken(token);
//         };
//     }
//
//     private _removeOverrideByToken(token: symbol): void {
//         const idx = this._overrides.findIndex(o => o.token === token);
//         if (idx >= 0) this._overrides.splice(idx, 1);
//     }
//
//     /**
//      * Convenience: enable an "instance debug" window for `ms`.
//      * During this window:
//      *   - DEBUG is enabled regardless of level.
//      *   - INFO is enabled if includeInfo === true (or previously enabled in options).
//      * Returns an idempotent disposer to end the window early.
//      */
//     public debugForMs(ms: number, opts?: { includeInfo?: boolean }): () => void {
//         if (!Number.isFinite(ms) || ms <= 0) return () => { /* no-op */ };
//
//         const includeInfo = !!opts?.includeInfo;
//         const prevUntil = this._instanceDebugUntil;
//         const prevInclude = this._instanceDebugIncludeInfo;
//
//         const now = this._now();
//         const newUntil = Math.max(prevUntil, now + ms);
//
//         this._instanceDebugUntil = newUntil;
//         this._instanceDebugIncludeInfo = this._instanceDebugIncludeInfo || includeInfo;
//
//         let disposed = false;
//         const timer = setTimeout(() => {
//             if (disposed) return;
//             disposed = true;
//             // Only collapse the window if our extension was the last contributor.
//             if (this._now() >= newUntil) {
//                 this._instanceDebugUntil = 0;
//                 // Restore previous includeInfo flag (best-effort). If multiple calls stacked,
//                 // next later disposer/timer will own the final reset as its time elapses.
//                 this._instanceDebugIncludeInfo = prevInclude;
//             }
//         }, newUntil - now);
//
//         return () => {
//             if (disposed) return;
//             disposed = true;
//             clearTimeout(timer);
//             // Early end: collapse window immediately (best-effort)
//             this._instanceDebugUntil = 0;
//             this._instanceDebugIncludeInfo = prevInclude;
//         };
//     }
//
//     /* --------------------------------- Gating -------------------------------- */
//
//     private _shouldLogError(): boolean {
//         // ERROR is always allowed if level >= ERROR (which is any level except NONE).
//         return this.level >= LogLevel.ERROR;
//     }
//
//     private _shouldLogWarn(): boolean {
//         // WARN uses independent threshold so WARN can appear in prod even at base ERROR.
//         return this.level >= this._warnLevel;
//     }
//
//     private _shouldLogInfo(): boolean {
//         const eff = this.level;
//         if (eff >= LogLevel.INFO) return true;
//         // Instance debug may optionally allow INFO bursts without changing level.
//         return this._isInstanceDebugActive() && this._instanceDebugIncludeInfo;
//     }
//
//     private _shouldLogDebug(): boolean {
//         const eff = this.level;
//         if (eff >= LogLevel.DEBUG) return true;
//         // Instance debug forces DEBUG on.
//         return this._isInstanceDebugActive();
//     }
//
//     private _shouldIncludeErrorStack(err: unknown): boolean {
//         if (this._stackPolicy === 'always') return true;
//         if (this._stackPolicy === 'never') return false;
//         // 'auto': include stack when debugging (high verbosity).
//         return this._shouldLogDebug();
//     }
//
//     /* --------------------------------- Emitters ------------------------------- */
//
//     public error(msg: unknown, data?: unknown): void {
//         if (this.level < LogLevel.ERROR) return;
//
//         let line = formatMsg(msg);
//         let extra = data;
//
//         // Attach stack if appropriate and available.
//         if (this._shouldIncludeErrorStack(msg)) {
//             const stack = extractStack(msg);
//             if (stack && stack.indexOf(line) === -1) {
//                 line = `${line}\n${stack}`;
//             } else if (stack) {
//                 line = stack; // stack already includes message
//             }
//         }
//
//         this._write('error', line, extra);
//     }
//
//     public warn = this.base.warn;
//
//     public info(msg: unknown, data?: unknown): void {
//         if (!this._shouldLogInfo()) return;
//         this._write('info', formatMsg(msg), data);
//     }
//
//     public debug(msg: unknown, data?: unknown): void {
//         if (!this._shouldLogDebug()) return;
//         this._write('debug', formatMsg(msg), data);
//     }
//
//     private _write(kind: keyof Required<NonNullable<Sinks>>, line: string, data?: unknown): void {
//         // Merge static tags into structured data if any.
//         const enriched = mergeDataWithTags(data, this._tags);
//         const redacted = this._redactor(enriched);
//         this._sinks[kind](line, isNothing(redacted) ? undefined : redacted);
//     }
//
//     /* --------------------------------- Child --------------------------------- */
//
//     public child(extraTags: Record<string, string>): ILogger {
//         // Child shares the same sinks/levels/overrides, only adds/overrides tags.
//         const mergedTags = { ...this._tags, ...(extraTags || {}) };
//         const child = new Logger({
//             level: this._baseLevel,
//             warnLevel: this._warnLevel,
//             stackPolicy: this._stackPolicy,
//             redactor: this._redactor,
//             sinks: this._sinks,
//             now: this._now,
//             tags: mergedTags,
//             // Do not copy instanceDebug window into the new instance;
//             // both will share behavior because they share the same clock and we only check time.
//             // If you prefer strict sharing, you could reference the same state, but keep it simple & predictable.
//             includeInfoInInstanceDebug: this._instanceDebugIncludeInfo,
//         });
//
//         // Share dynamic state by reference for true hierarchical behavior:
//         // (Override arrays & instance-debug window should be shared so child reflects parent's ops toggles.)
//         (child as any)._overrides = this._overrides;
//         (child as any)._instanceDebugUntil = this._instanceDebugUntil;
//
//         return child;
//     }
// }