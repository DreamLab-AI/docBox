---
name: Encrypted-at-rest portable per-project vaults with SSO-gated unlock
category: identity-and-access
round: 2
researcher: r7-encrypted-fs (sonnet)
verified: 2026-07-16
recommendation: gocryptfs (MIT) cipherdirs; v1 = decrypt-on-unlock (zero privileges), v2 = FUSE sidecar; keys wrapped in Azure Key Vault released on Entra session
---

# Per-project encrypted vaults

Licences verified via gh api + raw LICENSE reads, 2026-07-16.

## Filesystem options

| Option | Licence | Privileges | Portable? | Verdict |
|---|---|---|---|---|
| **gocryptfs** | MIT | Sidecar: `/dev/fuse` + `CAP_SYS_ADMIN` + apparmor:unconfined on Ubuntu (NOT `--privileged`) | Cipherdir = plain files → rsync/restic-friendly | **Primary pick** — active (same-day commits), the designated EncFS successor |
| LUKS loopback `.img` | GPL tooling (infra, not shipped code) | loop+device-mapper = SYS_ADMIN+, poorly documented minimal-cap path | Single opaque file; loop-dev collisions on concurrent unlocks | Only for literal one-file handoff |
| securefs | MIT (misdetected) | FUSE | Yes | Fallback; ~8mo stale |
| CryFS / EncFS | **LGPL-3.0** | FUSE | Yes | Excluded on licence; **EncFS also cryptographically broken for exactly our snapshot-sync workflow** (multi-snapshot ciphertext observation, defuse.ca audit) and dormant |
| fscrypt | Apache-2.0 | none | **No — host-bound policy + kernel keyring** | Wrong shape |
| ZFS native | CDDL + kernel module | high | Dataset, not file | Wrong shape + host burden |
| Docker volume-encryption plugins | — | — | — | No credible maintained option in 2026 |

## The two mechanisms

**v1 — decrypt-on-unlock (recommended):** control plane releases the DEK → an unlock job
decrypts the gocryptfs cipherdir to tmpfs/plain volume → dev container mounts it with **zero
FUSE, zero SYS_ADMIN, no sidecar** → on lock/session-end, re-encrypt changed blocks, shred
plaintext + DEK. Smallest privileged surface; also the only sane mechanism on Docker Desktop.

**v2 — live FUSE sidecar (server-side, Linux only):** sidecar owns `/dev/fuse` + vault files,
exposes the decrypted view via bind-mount with **`rshared` propagation; app container mounts
`rslave`** — the non-obvious gotcha: default `rprivate` propagation silently hides the mount
from the sibling container, named volumes can't do it at all, and **mount propagation does not
work on Docker Desktop**. Prior art exists (vmirage/docker-gocryptfs, MIT). Main container stays
unprivileged.

## Key management with SSO-gated unlock

| Option | Licence | Verdict |
|---|---|---|
| **Azure Key Vault** (client tenant) | managed | **v1** — Entra login → control plane calls wrap/unwrap (HSM key never leaves) → DEK to tmpfs `/run/secrets`. Client already trusts/audits this; native sign-in + access logs. |
| **OpenBao** | MPL-2.0 (flagged, acceptable) | v2 / non-Azure clients — Transit engine = same envelope crypto, Entra OIDC auth method; real ops burden |
| HashiCorp Vault | **BUSL 1.1 (IBM)** | **Excluded** — OpenBao is the pre-BUSL fork |
| SOPS + age | MPL-2.0 / BSD-3 | Complementary (bootstrap/config files) — no session concept, not the unlock service |
| Custom KEK/DEK in own DB | — | Re-inventing key custody badly; avoid as first build |

## Threat-model honesty (say this to the client plainly)

Protects: stolen/lost disk or laptop, leaked backups, storage-provider snooping, key-less host
read access. **Does NOT protect while unlocked**: host root, docker-socket access, malware
inside the container, RAM forensics of the DEK, a compromised Entra session, control-plane/Key
Vault policy compromise, authorised-insider exfil, ransomware (encryption ≠ backup). One-liner:
*"Protects data sitting still or in a backup someone shouldn't have; does nothing once someone
is inside the running container — that's what container isolation and host hardening are for."*

## Portability

gocryptfs encrypts per-4KB-block AES-256-GCM; unmodified blocks keep identical ciphertext →
cipherdirs are rsync/restic/kopia delta-friendly and safe to sync while locked. LUKS images
diff acceptably under content-defined chunking but need sparse-aware tooling and whole-image
mounts to restore one file. **Cipherdir wins for the "folder that moves between hosts" vision.**

## Composition note

The per-project vault slots into the s1 three-planes model as the User-Data plane's on-disk
format, and vault unlock/lock events are SYSTEM_EVENTs in the s2 audit trail.
