/* ---------------------------------- Types ---------------------------------- */

export type ColorMode   = 'auto' | 'on' | 'off';

const CSI = '\x1b[';
const colors = {
    red:    (s: string) => `${CSI}31m${s}${CSI}39m`,
    yellow: (s: string) => `${CSI}33m${s}${CSI}39m`,
    cyan:   (s: string) => `${CSI}36m${s}${CSI}39m`,
    dim:    (s: string) => `${CSI}2m${s}${CSI}22m`,
};

/* ------------------------------- Formatters -------------------------------- */

/** Minimal console formatter; color is auto by default. */
export function createConsoleFormatter(color: ColorMode = 'auto') {
    const gt: any = typeof globalThis !== 'undefined' ? globalThis : undefined;
    const nodeEnv = gt?.process?.env?.NODE_ENV as string | undefined;
    const isTTY = !!gt?.process?.stdout?.isTTY;
    const useColor = color === 'on' || (color === 'auto' && isTTY && nodeEnv !== 'production');

    return (level: 'error'|'warn'|'info'|'debug', msg: string, data?: unknown) => {
        const ts = new Date().toISOString();
        let prefix = `[${ts}] ${level.toUpperCase()}`;
        if (useColor) {
            if (level === 'error') prefix = colors.red(prefix);
            else if (level === 'warn') prefix = colors.yellow(prefix);
            else if (level === 'debug') prefix = colors.cyan(prefix);
            else prefix = colors.dim(prefix);
        }
        return data === undefined ? `${prefix} ${msg}` : `${prefix} ${msg} ${safeJson(data)}`;
    };
}

/* ----------------------------- Format helpers ------------------------------ */

function safeJson(data: unknown): string {
    const seen = new WeakSet<object>();
    try {
        return JSON.stringify(data, (_k, v) => {
            if (typeof v === 'bigint') return v.toString();
            if (v && typeof v === 'object') {
                if (seen.has(v as object)) return '[Circular]';
                seen.add(v as object);
            }
            return v;
        });
    } catch {
        try { return String(data); } catch { return '[Unserializable]'; }
    }
}
