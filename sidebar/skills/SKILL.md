---
name: creating-dsh-plugins
description: Use when building, extending, or fixing tools/plugins for DeepSeek Harness (dsh) — writing a dsh plugin entry module, registering a tool with defineTool, authoring parameters/output JSON Schemas, the dsh bundle manifest, or cordis.patch.yml, or when a plugin fails to load, a tool is missing from the agent, or tool calls error at runtime.
---

# Creating dsh Plugins

## Overview

A dsh plugin is a TypeScript module that registers **tools** (functions an AI agent can call) through dsh's plugin container (a fork of the cordis service framework). The plugin exports a cordis plugin (constants + `apply(ctx)`); inside `apply`, tools are registered with `ctx.tools.register(defineTool(...))`. A **bundle manifest** in `package.json` points dsh at a **patch file** that merges the plugin's config into the harness.

## When to Use

- Building a new tool for a DeepSeek Harness agent
- Porting existing code into a tool
- Fixing a plugin that loads but its tools are missing, or whose tool calls fail
- Reviewing another agent's plugin code

Do NOT use for: writing harness app logic or prompts (that is the harness application, not a plugin).

## The Tool API (authoritative, verified against `@deepseek-ai/dsh-tools`)

The single correct way to register a tool:

```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'my-tool'              // plugin id — must match the patch file's `id`
export const inject = ['tools']            // REQUIRED: makes ctx.tools available (type augmentation comes from @deepseek-ai/dsh-tools)

export function apply(ctx: Context) {
  ctx.tools.register(
    defineTool({
      name: 'get_weather',                 // tool name the agent calls
      description: 'Get current weather for a city.', // agent decides when to call
      parameters: {                        // input JSON Schema (draft-04-ish DSL, object)
        city: { type: 'string', description: 'City name', required: true },
      },
      output: {                            // REQUIRED — no default, always include
        schema: {
          type: 'object',
          properties: {
            temperature: { type: 'number', required: true },
            condition: { type: 'string', required: true },
          },
          additionalProperties: false,     // MUST be explicit on object schemas
        },
        render: (_args, value) => [{ type: 'text', text: `${value.temperature}°C, ${value.condition}` }],
      },
      async execute(args) {                // note: execute, not run
        return { temperature: 22, condition: 'sunny' }
      },
    }),
  )
}
```

### Hard rules of the schema DSL

| Rule | Detail |
|---|---|
| `required` is per-property | Write `required: true` inside each property. There is **no** `required` array and **no** `required: false`. Using either breaks type inference. |
| `additionalProperties` | Every object schema must set it explicitly (`false` to forbid extra keys). |
| `output` is mandatory | `defineTool` without `output` will not type-check. It must contain `schema` (object schema) + `render(args, value)` returning `ContentBlock[]`. |
| Render blocks | Return `{ type: 'text', text: string }` items (`ContentBlock` type from `@deepseek-ai/dsh-llm`). |
| `execute(args)` | Returns a value directly (JS object/string); it is **not** `run` and takes no harness-specific second arg unless the tool needs an execution context (then use `execute(args, exec)`). |

## Project Layout

```
my-tool/
├── src/index.ts          # plugin module (above)
├── package.json          # + dsh bundle manifest
├── cordis.patch.yml      # config patch merged into harness
├── tsconfig.json         # NodeNext ESM, outDir lib, strict
└── pnpm-workspace.yaml   # ONLY when using pnpm — upstream peer fix
```

**`package.json`** — the bundle manifest:

```json
{
  "name": "my-tool",
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",
  "files": ["lib", "cordis.patch.yml"],
  "scripts": { "build": "tsc" },
  "dependencies": {
    "@deepseek-ai/cordis": "latest",
    "@deepseek-ai/dsh-tools": "latest"
  },
  "devDependencies": { "typescript": "^5.5.0", "@types/node": "^22.0.0" },
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

**`cordis.patch.yml`** — tells dsh which plugin to load and under which id:

```yaml
- insert:
    - id: my-tool
      name: 'my-tool'
```

**`tsconfig.json`**:

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "strict": true,
    "skipLibCheck": true,
    "rootDir": "src",
    "outDir": "lib",
    "declaration": true
  }
}
```

**`pnpm-workspace.yaml`** — pnpm auto-installs peers, and `@deepseek-ai/dsh-session` declares an unpublished peer `@deepseek-ai/dsh-type-meta` (npm skips it gracefully, pnpm hard-fails). Only pnpm users need this override:

```yaml
overrides:
  "@deepseek-ai/dsh-type-meta": "npm:@deepseek-ai/dsh-invariants@0.0.1-rc.1"
```

## Workflow

1. **Scaffold or write by hand.** Fastest start: `npx @dsh-io/dsh-dev scaffold my-tool` (generates the exact layout above). Otherwise write the files as shown and install with `npm install`.
2. **Build:** `npm run build` → check `lib/index.js` exists.
3. **Develop against a live harness.** Point the harness web profile at your plugin's patch:
   `npx @deepseek-ai/dsh --profile web --patch <abs-path>/cordis.patch.yml`
   Re-run the command to pick up changes (the official CLI takes patches as overlay files).
4. **Verify it loads:** start the harness and confirm the tool is registered — the harness logs plugin registration, and the agent's tool list should include your tool name. You can dry-check config merge with the official CLI's config dump before booting.
5. **Register permanently** (per harness docs): `dsh plugin add <plugin-directory>` installs the plugin into the profile's plugin dir.
6. **Distribute:** publish the package to npm (`npm publish --access public`), and tag the repo on GitHub with the `dsh-plugin` topic so dsh users can find it.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Using `ctx.tools.register('name', { run(...) })` or an object map | The API is `ctx.tools.register(defineTool({ name, description, parameters, output, execute }))` — single object per tool, `execute` not `run`. |
| Forgetting `export const inject = ['tools']` | Without it `ctx.tools` is `undefined` at runtime and the plugin crashes with "no service available". |
| Omitting `output` | Not type-valid: `defineTool` requires it. |
| `required: ['city']` arrays or `required: false` | Per-property `required: true` only; anything else breaks type inference (and `required: false` is not a valid concept in this DSL). |
| Object schema without `additionalProperties` | Add `additionalProperties: false` explicitly. |
| Imports from `koishi` / `@koishijs/...` | dsh uses `@deepseek-ai/cordis`; the types come from `@deepseek-ai/dsh-tools` (it augments cordis' `Context`). |
| Patch `id` not matching `export const name` | The harness merges the patch under that id; a mismatch silently leaves the tool unregistered. |
| Relative path to patch | `dsh.bundle.patch` must be a path relative to the package root, and the patch file must be in `files` so it ships. |
| pnpm install failure on `@deepseek-ai/dsh-type-meta` | Add the `pnpm-workspace.yaml` override (see above). |
| Registering a tool but the agent never calls it | The tool needs a good `description` — that is what the agent uses to decide. |

## Quick Reference

| What | Where |
|---|---|
| Plugin id constant | `export const name = 'my-tool'` in `src/index.ts` |
| Service injection | `export const inject = ['tools']` |
| Tool registration | `ctx.tools.register(defineTool({...}))` |
| Tool definition source | `@deepseek-ai/dsh-tools` → `defineTool` |
| Container package | `@deepseek-ai/cordis` |
| Render block type | `@deepseek-ai/dsh-llm` → `ContentBlock` |
| Bundle manifest | `package.json` → `dsh.bundle.patch` |
| Config merge | `cordis.patch.yml` → `- insert: [{ id, name }]` |
| Scaffold CLI | `npx @dsh-io/dsh-dev scaffold <name>` |
| Live dev | `dsh web` + patch overlay, or `dsh plugin add <dir>` |
| Discovery | GitHub topic `dsh-plugin`; npm scoped packages |

安装方法：npx -p @deepseek-ai/dsh dsh plugin --profile web add /home/fei/workspace/dsh-sidebar-assistant