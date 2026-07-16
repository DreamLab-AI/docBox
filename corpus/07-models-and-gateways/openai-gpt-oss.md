---
name: OpenAI gpt-oss — the private local option for OpenAI-lineage reasoning
category: models-and-gateways
round: 3
researcher: main session (verified via perplexity + OpenAI docs 2026-07-16)
verified: 2026-07-16
recommendation: offer gpt-oss-20b/120b (Apache-2.0) as the local route on the agent's per-feature model switch: the private in-box option alongside the cloud providers, chosen when a client's data cannot leave the box
---

# OpenAI gpt-oss as the embedded model

Facts verified 2026-07-16 (OpenAI launch materials, help centre, arXiv model card).

## What it is

OpenAI's open-weight models, released under **Apache-2.0**:

| Model | Total params | Active (MoE) | Native quant | Memory target |
|---|---|---|---|---|
| **gpt-oss-20b** | 21B | 3.6B | MXFP4 | ~16 GB |
| **gpt-oss-120b** | 117B | 5.1B | MXFP4 | 80 GB (single GPU) |

Both are text-only reasoning models. They are **not served through OpenAI's API or ChatGPT**; you
run the weights yourself. That is their role for us: the `local` value on the agent's per-feature
model switch, sitting alongside the cloud providers as a peer rather than replacing them. Cloud
routes stay available for every feature; a client bound by GDPR or handling confidential code picks
`local` when a prompt cannot reach OpenAI, and picks a cloud provider when accuracy or capability
matters more than residency.

`gpt-oss-safeguard` variants (safety reasoning) exist as of 2026; no new base family supersedes
the two above.

## Why it fits docBox

- **Licence-clean**: Apache-2.0, no flow-down, ships in a client product without terms.
- **Same serving path as the other local models**: llama.cpp, Ollama, and vLLM all serve gpt-oss
  and expose an **OpenAI-compatible `/v1` endpoint**. So gpt-oss reaches the agent through the
  identical code path as the cloud OpenAI provider — only the base URL differs, and it points
  inside the box. No new gateway work.
- **The harmony caveat**: gpt-oss was trained on OpenAI's *harmony* response format; the runtime
  must speak it. llama.cpp, Ollama, and vLLM all handle this. Note it in the runtime config.

## Wiring in the product

- Config: `models.local.name` gains `gpt-oss-20b` / `gpt-oss-120b` (apply-class **rebuild**: which
  weights ship). `models.local.runtime` picks the server; `models.local.endpoint` is the in-box
  OpenAI-compatible URL the gateway routes `local` calls to, with the cloud providers reachable on
  the same switch.
- Compose: the `local-model` service serves the chosen weights on `agent-net`, loopback-bound.
  gpt-oss-120b needs the GPU reservation (commented in compose; uncomment on a GPU host).
- Reality: gpt-oss-20b is the sensible default for a CPU/16GB box; gpt-oss-120b is a GPU-host
  upgrade for stronger reasoning that still never leaves the premises.

## Sources

OpenAI: introducing-gpt-oss, open-weight models help article, open-models page; arXiv 2508.10925
(model card). Runtime OpenAI-compatible endpoints: vLLM/Ollama/llama.cpp server docs. Full list
in the round-3 research transcript.
