---
name: Claude Code on the web / Claude Cowork
category: anthropic-native
url: https://support.claude.com/en/articles/14479288-claude-cowork-architecture-overview
license: proprietary-service
license_ok_for_client: false
role: reference-architecture
verified: 2026-07-16
---

# Claude Code on the web / Claude Cowork — the reference architecture

This is the model the project emulates. Not usable directly (managed Anthropic services), but the
isolation stack is documented well enough to reimplement with permissive components.

## Claude Code on the web

- Each session runs in a **per-session VM** isolated and managed by Anthropic — not a shared
  container pool.
- **Network egress is proxied** through Anthropic infrastructure with default allowlists; secrets
  such as GitHub tokens get special scoped handling (the agent never holds the raw credential for
  arbitrary egress).
- The session has "full access to its server" — the VM boundary is the security perimeter, so the
  agent can be given root-like freedom *inside* it.

## Claude Cowork (local desktop)

Four nested layers, outermost first:

1. **Hardware-level VM** — a dedicated Linux VM per Cowork instance:
   macOS uses Apple Virtualization.framework (`VZVirtualMachine`); Windows uses Hyper-V.
2. **Process sandbox inside the VM** — Claude Code CLI runs under **bubblewrap (bwrap)** with
   **seccomp** syscall filtering. Even a VM compromise requires a second escape.
3. **Filesystem whitelist** — only folders the user explicitly shares are mounted (VirtioFS);
   everything else does not exist inside the VM.
4. **Egress proxy** — all network traffic routes through a local proxy enforcing a strict domain
   allowlist.

Remote Cowork sessions use per-session sandboxes/VMs on Anthropic infra, torn down at session end.

## What is NOT used

No Docker, no gVisor, no Firecracker in the official Claude Code / Cowork stack. (gVisor is
reported for claude.ai's separate in-chat code-execution tool, not Claude Code.) Anthropic's
choices are: **OS process sandbox (bwrap/Seatbelt) for cheap local isolation, full VMs when the
agent needs root-like autonomy.**

## Design lessons for our container

- The web UI never talks to the agent process directly; it talks to a control plane that proxies
  into the isolated environment.
- Network allowlisting is the load-bearing control — every layer re-enforces it.
- Per-session disposable environments beat long-lived shared ones.
- A container (our substitute for their VM) should still run the agent under an inner sandbox
  ([srt](sandbox-runtime-srt.md)) — one boundary is never enough.

## Sources

- https://support.claude.com/en/articles/14479288-claude-cowork-architecture-overview
- https://www.anthropic.com/engineering/how-we-contain-claude
- https://www.anthropic.com/engineering/claude-code-sandboxing
- https://code.claude.com/docs/en/sandbox-environments
- https://pvieito.com/2026/01/inside-claude-cowork (independent teardown)
