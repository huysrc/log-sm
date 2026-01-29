# Tests for log-sm

This repo uses **Node's built-in test runner** (`node:test`) so there are **zero extra dev dependencies**.

## Requirements
- Node.js **v18+** (recommended: v20+).

## How to run

1) Build the package (generates `dist/` via tsup):
```bash
npm run build
```

2) Run tests:
```bash
node --test
```

## Recommended package.json script

Update your `package.json`:

```json
{
  "scripts": {
    "test": "npm run build && node --test"
  }
}
```

## What is covered

- `core.ts`:
  - env/option level resolution, WARN gate vs base gate
  - warn/debug fallback routing
  - console formatter behavior
  - tag merging (`tags`, `withTags`, merge policies) + `child()`
  - error normalization + input policies
  - mask + truncate pipeline (BigInt + Buffer summarization)
  - runtime overrides (`withLevel`, `withLevelTimed`, `debugForMs`)

- `redact.ts`:
  - default mask keys + extending defaults
  - case-insensitive + partial match
  - circular refs, depth/node guards
  - Map/Set/Error/Date/Buffer handling
  - getter error value, inherited keys, symbol keys

- `format.ts`:
  - `{ msg, data }` contract
  - color modes (`off` vs `on`)
