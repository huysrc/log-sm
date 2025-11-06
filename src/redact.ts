// src/redact.ts
// Optional redact helpers for log-sm core
// Author: Huy Nguyen, 2025
// License: MIT

/* ---------------------------------- Types ---------------------------------- */

export type RedactOptions = {
    /** Replace value for matching keys; default '***' */
    mask?: string;
    /** Case-insensitive key matching. Default: false */
    ciKeys?: boolean;
    /** Partial key match (e.g., containing 'token'). Default: false */
    partialMatch?: boolean;
    /** Mask map keys; default false */
    maskMapKeys?: boolean;
    /** Mask typed arrays; default false */
    maskTypedArrays?: boolean;
    /** Include inherited enumerable keys; default false (own keys only) */
    includeInherited?: boolean;
    /** Include symbol keys; default false for speed */
    includeSymbols?: boolean;
    /** Value to use when a getter throws; default '[GetterError]' */
    getterErrorValue?: string;
    /** Max recursion depth; 0 = only root. Default: 8 */
    maxDepth?: number;
    /** Max visited nodes to avoid pathological graphs. Default: 50_000 */
    maxNodes?: number;
};

/* --------------------------- Default mask key set --------------------------- */

export const DEFAULT_MASK_KEYS: readonly string[] = Object.freeze([
    'password', 'token', 'idToken', 'accessToken', 'refreshToken', 'authorization',
    'secret', 'clientSecret', 'apiKey', 'x-api-key',
    'card', 'cvv', 'ssn',
]);

const DEFAULT_MASK_SET = new Set(DEFAULT_MASK_KEYS);

/** Extend the default mask key set. */
export function extendDefaultMaskKeys(keys: string[]): void {
    for (const k of keys) DEFAULT_MASK_SET.add(k);
}

/* ------------------------------- Redact core ------------------------------- */

type RedactState = {
    seen: WeakSet<object>;
    nodes: number;
};

/** Deep redact with cycle/size guards; supports Map/Set/TypedArray/Error/Buffer; masks any type by key. */
export function redact(
    value: unknown,
    maskKeys: Array<string | symbol> | Set<string | symbol> | undefined,
    maskOrOpts: string | RedactOptions = '***'
): unknown {
    if (!maskKeys || value == null) return value;
    if (typeof value !== 'object') return value; // Primitives fast-path
    const maskSet = Array.isArray(maskKeys) ? new Set(maskKeys) : maskKeys;
    const opts: RedactOptions = typeof maskOrOpts === 'string' ? { mask: maskOrOpts } : maskOrOpts;
    const state: RedactState = { seen: new WeakSet<object>(), nodes: 0 };
    return deepRedact(value, {
        maskSet: maskSet,
        mask: opts.mask ?? '***',
        maxDepth: opts.maxDepth ?? 8,
        maxNodes: opts.maxNodes ?? 50_000,
        matchKey: makeKeyMatcher(maskSet, !!opts.ciKeys, !!opts.partialMatch),
        partialMatch: opts.partialMatch ?? false,
        maskMapKeys: opts.maskMapKeys ?? false,
        maskTypedArrays: opts.maskTypedArrays ?? false,
        includeInherited: opts.includeInherited ?? false,
        includeSymbols: opts.includeSymbols ?? false,
        getterError: opts.getterErrorValue ?? '[GetterError]',
    }, state, 0);
}

/** Create a mask function for a set of keys. If no keys are provided, defaults to DEFAULT_MASK_SET. */
export function makeMask(maskKeys?: string[] | Set<string>, opts?: RedactOptions) {
    if (maskKeys === null || (Array.isArray(maskKeys) && maskKeys.length === 0)) return (x: unknown) => x;
    if (typeof maskKeys === 'undefined') maskKeys = DEFAULT_MASK_SET;
    const set = Array.isArray(maskKeys) ? new Set(maskKeys) : maskKeys;
    return (x: unknown) => maskArgs(x, set, opts);
}

/** Mask object recursively. */
export function maskArgs<T>(obj: T, maskKeys?: string[] | Set<string>, opts?: RedactOptions): T {
    return redact(obj, maskKeys ?? DEFAULT_MASK_SET, opts ?? undefined) as T;
}

/* ------------------------------- Internals --------------------------------- */

// Global helpers (safe for browser and Node without @types/node)
const GT: any = typeof globalThis !== 'undefined' ? globalThis : undefined;
const hasNodeBuffer = !!GT?.Buffer?.isBuffer;
const isBuffer = (v: unknown): v is { length: number } => hasNodeBuffer && GT.Buffer.isBuffer(v);

function deepRedact(
    value: unknown,
    p: {
        maskSet: Set<string | symbol>,
        mask: string,
        maxDepth: number,
        maxNodes: number,
        matchKey: (k: string | symbol) => boolean,
        partialMatch: boolean;
        maskMapKeys: boolean;
        maskTypedArrays: boolean;
        includeInherited: boolean;
        includeSymbols: boolean;
        getterError: string;
    },
    _state: RedactState,
    _depth = 0
): unknown {
    // Guard primitives and null before check WeakSet/ArrayBuffer/Map…
    if (value === null || typeof value !== 'object') return value;

    // Guards: Cycle, depth and size. (inexpensive ones first)
    const obj = value as Record<string | symbol, unknown>;
    if (_depth >= p.maxDepth) return '[DepthLimit]';
    if (_state.nodes++ > p.maxNodes) return '[TooLarge]';
    if (_state.seen.has(obj)) return '[Circular]';
    _state.seen.add(obj);

    // --- TypedArray / ArrayBuffer (optional, avoid huge dumps) ---
    if (p.maskTypedArrays && (ArrayBuffer.isView(obj) || obj instanceof ArrayBuffer)) {
        const len = ArrayBuffer.isView(obj) ? (obj as ArrayBufferView).byteLength : obj.byteLength;
        return `[TypedArray ${len} bytes]`;
    }

    // Common special cases
    if (Array.isArray(obj)) {
        const out: unknown[] = new Array(obj.length);
        for (let i = 0; i < obj.length; i++) try { out[i] = deepRedact(obj[i], p, _state, _depth + 1); } catch { out[i] = p.getterError; }
        return out;
    }
    if (obj instanceof Map) {
        // Turn Map into an array of [k, v], and redact values (keys untouched)
        const out: [unknown, unknown][] = [];
        for (const [k, v] of obj) {
            const mk = p.maskMapKeys
                && (typeof k === 'string' || typeof k === 'symbol')
                && (p.matchKey(k) || (typeof k === 'string' && isSensitiveKeyName(k)));
            try { out.push([mk ? p.mask : k, deepRedact(v, p, _state, _depth + 1)]); } catch { out.push([k, p.getterError]); }
        }
        return out;
    }
    if (obj instanceof Set) {
        const out: unknown[] = [];
        for (const v of obj) try { out.push(deepRedact(v, p, _state, _depth + 1)); } catch { out.push(p.getterError); }
        return out;
    }
    if (obj instanceof Error) {
        const out: Record<string, unknown> = { name: obj.name, message: obj.message }; // stack handled elsewhere
        for (const k of Object.keys(obj)) if (!(k in out)) out[k] = (obj as any)[k];
        return out;
    }
    if (obj instanceof Date) return new Date(obj.getTime());
    if (isBuffer(obj)) return '[Buffer]';

    // Non-plain objects: copy enumerable own (and optionally inherited) properties only
    // For logging, prefer to treat class instances like plain bags.
    const out: Record<string | symbol, unknown> = {};
    const keys = isPlainObject(obj)
        ? getObjectKeys(obj, { ...p, includeInherited: false }) // plain objects: own by default
        : getObjectKeys(obj, p); // non-plain: follow options strictly

    // eslint-disable-next-line guard-for-in
    for (const k of keys) {
        try {
            out[k] = p.matchKey(k) ? p.mask : deepRedact((obj as any)[k], p, _state, _depth + 1);
        } catch {
            out[k] = p.getterError;
        }
    }
    return out;
}

/** Create a key matcher function */
function makeKeyMatcher(keys: (string | symbol)[] | Set<string | symbol>, ci = false, partial = false) {
    const stringSet = new Set<string>();
    const symbolSet = new Set<symbol>();
    const arr = Array.isArray(keys) ? keys : Array.from(keys);
    for (let i = arr.length - 1; i >= 0; i--) {
        const k = arr[i];
        if (typeof k === 'string') stringSet.add(ci ? k.toLowerCase() : k);
        else symbolSet.add(k as symbol);
    }
    return (k: string | symbol) => {
        if (typeof k === 'string') {
            const kk = ci ? k.toLowerCase() : k;
            if (stringSet.has(kk)) return true;
            if (partial) for (const sk of stringSet) if (kk.includes(sk)) return true;
            return false;
        }
        return symbolSet.has(k);
    };
}

/** Very small heuristic to consider a key sensitive */
function isSensitiveKeyName(name: string): boolean {
    if (name.includes('@') && name.includes('.')) return true; // email-like
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(name)) return true; // uuid-like
    return /^[A-Za-z0-9_\-]{24,}$/.test(name); // long hex/base64url-ish tokens
}

/** Fast plain-object detection (no prototype or direct Object prototype) */
function isPlainObject(v: unknown): v is Record<string | symbol, unknown> {
    if (v === null || typeof v !== 'object') return false;
    const proto = Object.getPrototypeOf(v);
    return proto === Object.prototype || proto === null;
}

/** Single pass key iterator based on options */
function getObjectKeys(
    obj: Record<string | symbol, unknown>,
    opts: RedactOptions
): Array<string | symbol> {
    if (opts.includeInherited) {
        const keys: (string | symbol)[] = []; // Use for…in to include inherited enumerable string keys (symbols are never visited by for…in)
        for (const k in obj) keys.push(k);
        if (opts.includeSymbols) { // Symbols on a prototype chain are non-enumerable; we only add our own symbols for practicality
            const ownSymbols = Object.getOwnPropertySymbols(obj);
            for (const s of ownSymbols) if (Object.getOwnPropertyDescriptor(obj, s)?.enumerable) keys.push(s);
        }
        return keys;
    } else {
        if (opts.includeSymbols) {
            const out: (string | symbol)[] = [];
            for (const k of Object.keys(obj)) out.push(k);
            const ownSymbols = Object.getOwnPropertySymbols(obj);
            for (const s of ownSymbols) if (Object.getOwnPropertyDescriptor(obj, s)?.enumerable) out.push(s);
            return out;
        }
        return Object.keys(obj) as string[]; // Own enumerable keys only (fast path; preferred for logging)
    }
}
