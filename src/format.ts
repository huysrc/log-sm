// src/format.ts
// Console formatter helpers for log-sm.
//
// Note:
// - `ConsoleFormatter` must return `{ msg, data }` because core.ts passes
//   them to console.* as separate arguments (msg, data).
// - This file is intentionally standalone and zero-deps.

import type { ConsoleFormatter } from './core';

/* ---------------------------------- Types ---------------------------------- */

export type ColorMode = 'auto' | 'on' | 'off';

/* --------------------------------- ANSI ----------------------------------- */

const CSI = '\x1b[';
const colors = {
    red:    (s: string) => `${CSI}31m${s}${CSI}39m`,
    yellow: (s: string) => `${CSI}33m${s}${CSI}39m`,
    cyan:   (s: string) => `${CSI}36m${s}${CSI}39m`,
    dim:    (s: string) => `${CSI}2m${s}${CSI}22m`,
};

function isNodeLike(gt: any): boolean {
    // Detect Node without importing anything.
    // - process.versions.node is a common, stable indicator.
    return !!gt?.process?.versions?.node;
}

function getEnvString(gt: any, key: string): string | undefined {
    const v = gt?.process?.env?.[key];
    return typeof v === 'string' ? v : undefined;
}

function shouldUseColor(color: ColorMode): boolean {
    if (color === 'off') return false;

    const gt: any = typeof globalThis !== 'undefined' ? globalThis : undefined;

    // Respect NO_COLOR when auto/on.
    // https://no-color.org/
    const noColor = getEnvString(gt, 'NO_COLOR');
    if (noColor != null && noColor !== '') return false;

    // In Node, prefer TTY in auto mode.
    const node = isNodeLike(gt);
    const isTTY = !!gt?.process?.stdout?.isTTY;

    // Optional: in production, default auto disables ANSI.
    const nodeEnv = getEnvString(gt, 'NODE_ENV');
    const prod = (nodeEnv ?? '').trim().toLowerCase() === 'production';

    if (color === 'on') {
        // "on" forces ANSI even if not a TTY; caller knows what they want.
        return true;
    }

    // auto
    return node && isTTY && !prod;
}

function colorize(level: 'error' | 'warn' | 'info' | 'debug', text: string): string {
    if (level === 'error') return colors.red(text);
    if (level === 'warn')  return colors.yellow(text);
    if (level === 'debug') return colors.cyan(text);
    return colors.dim(text);
}

/* ------------------------------- Formatters -------------------------------- */

/**
 * Minimal console formatter.
 *
 * - `color='auto'`: enable ANSI when running in Node on a TTY and not production.
 * - Returns `{ msg, data }` (never stringifies `data`).
 */
export function createConsoleFormatter(color: ColorMode = 'auto'): ConsoleFormatter {
    const useColor = shouldUseColor(color);

    return (level, msg, data) => {
        const ts = new Date().toISOString();
        let prefix = `[${ts}] ${level.toUpperCase()}`;
        if (useColor) prefix = colorize(level, prefix);

        const line = `${prefix} ${msg}`;
        return data === undefined ? { msg: line } : { msg: line, data };
    };
}
