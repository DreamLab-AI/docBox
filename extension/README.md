# docBox Companion

The **primary user's surface** for docBox, shipped as a code-server (VS Code web)
sidebar extension. It adds two docked views to the activity bar:

- **Chat** — talk to the agent (the pi engine, via the control-plane server). The
  docked replacement for the earlier "chat bubble" idea.
- **Documents** — list uploaded documents with their OCR status, and upload more
  through the native file picker.

The file manager is **VS Code's own explorer**: browse, open, rename, diff, and
search across `/workspace` with the editor you already have. This extension adds
only the two things the explorer does not: the agent chat and the documents/OCR
panel. The rationale is [ADR-007](../docs/reference/adr/ADR-007-primary-user-surface.md).

Foreman (`app/` + `server/`) remains the **admin's** control plane. This Companion
is the **primary user's** surface. They do not overlap.

## What it talks to

Everything goes to the docBox **control-plane server** (`server/`), set by the
`docbox.controlPlaneUrl` setting (default `http://127.0.0.1:8787`, the dev server).
The extension holds no agent logic and no datastore: it is a thin client onto the
one server we own.

| View | Call | Server route |
|---|---|---|
| Chat | `POST /api/chat` with `{ prompt }` | Relayed to the pi engine in RPC mode; the reply streams back as SSE (`ADR-005`), or arrives as one JSON body until that route lands (`PRD-003`, M3). The Chat view handles both. |
| Documents | `GET /api/documents` | Lists documents (`DocumentInfo`). |
| Documents | `POST /api/documents` with `{ name, sizeKb, mime, pages }` | Registers an upload and queues OCR; the server picks the OCR route (local vs cloud) from config, so the privacy switch is honoured server-side. |

In the container the server sits behind oauth2-proxy on the same origin as
code-server, so the browser session that opened the editor authenticates these
calls with no token handling in the extension.

## Build

```bash
cd extension
npm install            # or: pnpm install
npm run compile        # tsc --noEmit — the type check / compile gate
npm run build          # esbuild bundle → out/extension.js (for packaging)
```

`npm run compile` is the check used in this repo. If dependency install is
blocked in your environment, the sources are written to compile against
`@types/vscode` and `@types/node`; install those two packages and `typescript`
to run the check.

## How it loads in code-server

This extension **cannot run in this dev environment**: it needs a code-server (or
VS Code) host, and code-server is not launched here. It is compile-checked only.

On a real box it loads like any VS Code extension:

1. Package it: `npx vsce package` produces a `.vsix`.
2. Install into the running editor: `code-server --install-extension docbox-companion-0.1.0.vsix`,
   or drop the built folder into the extensions directory
   (`~/.local/share/code-server/extensions/`).
3. Reload the window. A **docBox** icon appears in the activity bar with the
   **Chat** and **Documents** views.
4. Set `docbox.controlPlaneUrl` if the control plane is not on the default
   origin.

## Files

```
extension/
├── package.json          ← manifest: the docBox view container + two webview views, the setting
├── tsconfig.json         ← strict, CommonJS, ES2022
├── src/
│   ├── extension.ts      ← activate(): register the two webview providers + refresh command
│   ├── chatView.ts       ← Chat provider; POSTs prompts, streams pi's SSE deltas
│   ├── documentsView.ts  ← Documents provider; lists + uploads via the VS Code file picker
│   ├── controlPlane.ts   ← resolves the control-plane URL from settings
│   └── util.ts           ← webview nonce, MIME guess
└── media/
    ├── docbox.svg        ← activity-bar icon
    ├── chat.css          ← dark-theme chat styling (VS Code CSS variables)
    └── documents.css     ← dark-theme documents styling (VS Code CSS variables)
```

## Licence

[Apache-2.0](../LICENSE), matching the rest of docBox.
