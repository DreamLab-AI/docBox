# Future document stubs

Placeholders for documents we expect to write. This file is kept honest against what has actually
landed: several numbers the earlier stubs reserved were used for different topics as the design
moved, so those stale predictions have been removed rather than left to mislead.

## Written (for reference, so numbers are not reused)

- PRD-001 control plane · PRD-002 backend · PRD-003 agent engine · PRD-004 container and rebuild ·
  PRD-005 identity and network · PRD-006 audit and vaults · PRD-007 documents and OCR.
- ADR-001 stack · ADR-002 apply-class · ADR-003 visualiser · ADR-004 config/TOML ·
  ADR-005 live-event transport · ADR-006 snapshot store · ADR-007 primary-user surface ·
  ADR-008 self-modifying interface · ADR-009 slim core, surfaces as modules.
- DDD-001 control-plane domain · DDD-002 overhaul lifecycle · DDD-003 interface domain.

## Still to write

- **ADR — harness integration boundary.** pi RPC vs SDK, and exactly where the audit and identity
  hooks attach. Partly covered by PRD-003; promote to an ADR when M3 wires pi.
- **ADR — ledger boundary.** beads behind a narrow interface; embedded vs server Dolt. Covered as
  research in `corpus/12-agent-harness/beads-work-ledger.md`; promote when the ledger is wired.
- **ADR — optional streamed-desktop surface.** The neko/Selkies vs Guacamole choice, and the
  requirement that a desktop surface's consequential actions still route through the core audit
  contract (ADR-009). Write if the client brief wants native apps.
- **PRD — chat surface.** The primary-user chat: the companion extension (ADR-007) is the
  code-server path; a deep-chat bubble is the non-code-server path. Write when a host is chosen.
