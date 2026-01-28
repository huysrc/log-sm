import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        core: 'src/core.ts',
        redact: 'src/redact.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: false,
    clean: true,
    minify: true,
    treeshake: true,
    outDir: 'dist',
    skipNodeModulesBundle: true
});

// export default defineConfig([{
//     entry: {
//         core: 'src/core.ts',
//         redact: 'src/redact.ts',
//         format: 'src/format.ts',
//     },
//     format: ['esm', 'cjs'],
//     define: { __LOGSM_DYNAMIC_PRO__: "false" },
//     dts: true,
//     sourcemap: false,
//     clean: true,
//     minify: true,
//     treeshake: true,
//     outDir: 'dist',
//     skipNodeModulesBundle: true
// },{
//     entry: {
//         pro: 'src/core.ts',
//     },
//     format: ['esm', 'cjs'],
//     define: { __LOGSM_DYNAMIC_PRO__: "true" },
//     dts: true,
//     sourcemap: false,
//     clean: true,
//     minify: true,
//     treeshake: true,
//     outDir: 'dist',
//     skipNodeModulesBundle: true
// }]);
