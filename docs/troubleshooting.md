# Troubleshooting — first-run snags

Six things that trip people up on the first run, most common first.

## 1. The data looks fabricated → you are in demo mode

**Symptom.** The same four people appear every time (Dana Okoro, Ravi Menon, Lena
Fischer, Sam Whitfield), the clock never moves off 16 July 2026, every panel
heading carries a **DEMO DATA** chip, and a strip under the tab bar reads:

> Demo world — every owner, agent, action, document and patient record below is fabricated (ADR-001; the patient is wholly synthetic, PRD-009). Nothing here is real until you go live.

**This is not a fault.** It is the point. Foreman boots a deterministic mock world
by default (ADR-001) so the interface renders offline and the same on every load.
Actions you take are tagged **Simulated** and change nothing on a real system.

**To move on.** Follow [mock-to-live.md](mock-to-live.md). Setting
`VITE_DATA_MODE=live` with the dev server running transports the world over the
real server; a real datastore (the host rung) is what finally makes the data real.

## 2. `http://127.0.0.1:8787` is a 404 → no compiled UI to serve

**Symptom.** The control-plane server is running, but opening `http://127.0.0.1:8787`
in a browser returns a 404 rather than Foreman.

**Cause.** The server hosts the UI only when a compiled build exists: it serves
`app/dist` from the static block (`server/src/index.ts` — `existsSync(APP_DIST)`).
In dev there is no `app/dist`, so the panel lives on Vite at `http://localhost:5173`
and the server exposes only the `/api/*` routes (plus `/bubble`). An unbuilt server
root is therefore a 404 by design, not a fault.

**Fix.** Either use the dev split — the server on `8787` for the API and Vite on
`5173` for the UI (`pnpm launch dev`, or the two manual terminals in
[mock-to-live.md](mock-to-live.md)) — or build the one-port bundle: `pnpm build`
then restart the server, or simply `pnpm launch up`, which builds `app/dist` and
serves the UI and API together on `8787`.

**Where is the user pane?** Foreman on `8787`/`5173` is the *admin* surface. The
primary user's chat surface is elsewhere: the **Companion** sidebar inside
code-server (`extension/`), or the embeddable **chat bubble** the server serves at
`http://127.0.0.1:8787/bubble` (with the widget script at `/bubble.js`). The bubble
routes are registered ahead of the static UI, so `/bubble` works whether or not
`app/dist` is built.

## 3. Port 5173 is already in use

**Symptom.** `pnpm dev:app` (or `pnpm dev`) fails to bind, or Vite quietly starts
on a different port than `http://localhost:5173`.

**Cause.** Another Vite instance — often a second terminal — already holds 5173.

**Fix.** Stop the other instance, or let Vite pick the next free port and open the
URL it prints. If you are running dev-live, note that the server's CORS default
allows the `http://localhost:5173` origin (`server/src/index.ts:34`); a different
UI port needs `DOCBOX_ALLOWED_ORIGIN` set to match.

## 4. `VITE_DATA_MODE=live` is set but the server is not running

**Symptom.** You asked for live, but the strip turns amber and reads:

> Live requested but the control plane is unreachable — still showing demo data.

**Cause.** The UI tried to fetch `/api/world` and got no answer, so it kept the
mock world and recorded a **degraded** state (`app/src/data/live.ts`). This is the
one strip that is *not* dismissible — it surfaces a real fault.

**Fix.** Start the control-plane server first, in its own terminal:

```bash
pnpm dev:server        # http://127.0.0.1:8787
```

Then reload the UI. The strip should switch to the seeded live notice, and the
header badge to **live**. Full sequence in [mock-to-live.md](mock-to-live.md).

## 5. Wrong Node or pnpm version

**Symptom.** `pnpm install` or the dev server fails with engine or module errors.

**Cause.** A Node or pnpm version the project does not target.

**Fix.** Use **Node 24** and **pnpm 10** (see [CONTRIBUTING.md](../CONTRIBUTING.md)).
Install with `--frozen-lockfile` in automation so the committed lockfile
(`app/pnpm-lock.yaml`, lockfile format 9) is honoured.

## 6. A single panel shows an error box

**Symptom.** One tab renders an error panel while the rest of Foreman works.

**Cause and fix.** This is containment, not a crash. Each panel is isolated behind
its own `PanelBoundary` (ADR-010), so a fault in one panel cannot blank the whole
interface. Read the message in the boundary, switch to another tab, and reload —
the rest of the box keeps working while you do.

## See also

- [getting-started.md](getting-started.md) — the first-run tour.
- [mock-to-live.md](mock-to-live.md) — mock, dev-live and host.
- [CONTRIBUTING.md](../CONTRIBUTING.md) — versions, checks, and the four rules.
