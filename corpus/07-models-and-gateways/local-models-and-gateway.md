---
name: Embedded local model + multi-provider LLM gateway
category: models-and-gateways
round: 2
researcher: r2-local-model (sonnet)
verified: 2026-07-16
recommendation: Qwen3-4B/8B (Apache-2.0) or Gemma 4 (now Apache-2.0!) on llama.cpp / Docker Model Runner; LiteLLM (MIT core) gateway
---

# Embedded local model + provider gateway

Licences verified via gh api + HuggingFace API license fields, 2026-07-16.

## Headline: the Gemma licence trap has a version boundary

| Gemma generation | Licence |
|---|---|
| Gemma ≤3n (incl. Gemma 3, CodeGemma, etc.) | **Gemma Terms of Use — non-OSI.** Redistribution requires bundling the Terms, flowing down use restrictions as an enforceable clause in the CLIENT's own EULA, incorporating Google's Prohibited Use Policy, modification notices. Google can amend unilaterally. **Do not ship.** |
| **Gemma 4** (E2B/E4B/26B-A4B/31B, released 2026-04-02) | **Apache-2.0.** Clean. |

So "embed a Gemma model" is fine **iff it is Gemma 4**. The earlier assumption that Gemma is
categorically encumbered is outdated as of April 2026.

## Small permissive models (2-9B), ranked mid-2026

1. **Qwen3-4B / Qwen3-8B** (Apache-2.0) — most battle-tested, best tool-calling, day-0 GGUF.
2. **Gemma-4-E4B / E2B** (Apache-2.0) — strong, native multimodal, newer/less proven.
3. **GLM-4-9B-0414 / GLM-Z1-9B** (MIT) — current GLM gen is MIT; older glm-4-9b-chat is NOT.
4. **Phi-4-mini 3.8B** (MIT) — best reasoning-per-parameter footprint.
5. **Ministral-3 8B** (Apache-2.0 — the 2025-12 gen; the 2024 Ministral-8B-2410 is MRL research-only, do not confuse).

**Rejected for shipping:** Gemma ≤3n, Ministral-8B-2410 (MRL), all Llama (700M-MAU clause,
"Built with Llama" attribution, naming mandate, AUP flow-down).

## Runtime (CPU-first)

- **llama.cpp (MIT)** — the right engine for CPU/GGUF.
- **Docker Model Runner (Apache-2.0)** — GA since Oct 2025, llama.cpp-backed, works on Docker CE
  (not just Desktop) since ~Dec 2025. Cleanest packaging for our compose stack.
- Ollama (MIT) fine as alternative; note its multimodal path now uses an in-house Go engine
  (architecture change, still MIT).
- **vLLM: wrong tool** for CPU-first (GPU-centric design).

**Sizing**: Q4 GGUF ≈ 5.0 GB (Qwen3-8B) / ~2.3-3 GB (4B class). RAM ≈ file size × 1.2-1.3 at
8K context; KV cache dominates at long context (~4 GB extra at 32K for 8B). Plan **8 vCPU /
16 GB RAM** for the model service at 4-9B Q4, 8-16K context. Expect background-task speeds on
CPU, not chat-speed UX.

## Gateway (TOML/dotenv-provisioned multi-provider)

| Gateway | Licence | Verdict |
|---|---|---|
| **LiteLLM** | MIT core; `enterprise/` subtree is proprietary (paid for production) | **Pick** — broadest coverage (Anthropic, OpenAI, DeepSeek, GLM, Ollama/local), YAML+env config, proxy-container model. Exclude `enterprise/` from the shipped image. |
| **any-llm** (Mozilla) | Apache-2.0, no carve-outs | Cleanest licence story; less mature as a standalone gateway. The zero-explanations-to-legal option. |
| llama-swap | MIT | Local-GGUF hot-swap router only; pair alongside, not instead. |
| OpenRouter | SaaS | Not shippable; adds an intermediary without fixing residency issues. |

Note for the TS-first constraint (r9 stream): LiteLLM is Python — if the core must stay
one-language, weigh any-llm/TS-native alternatives from the r9 findings.

## DeepSeek / GLM hosted APIs from UK/EU — compliance gate

Both are PRC-hosted: data processed/stored in China (DeepSeek policy updated 2026-02-10; Italian
Garante and Berlin DPA actions in 2025). No China adequacy decision → GDPR Chapter V transfer
problem + National Intelligence Law Art. 7 compulsion risk that SCCs disclose but cannot cure.
**Rule**: hosted DeepSeek/GLM only for non-sensitive/dev workloads with DPA + Art. 46 mechanism +
legal sign-off; for regulated data, **self-host the MIT-licensed GLM/DeepSeek open weights** on
client-controlled infra instead — removes the transfer question entirely.

## Sources

ai.google.dev/gemma/terms; Google Open Source Blog (Gemma 4 Apache-2.0, 2026-03);
HuggingFace API license fields (Qwen3, Phi-4, Ministral, GLM-4.x, OLMo, Llama);
gh api (llama.cpp, ollama, vllm, litellm + enterprise/LICENSE.md, mozilla-ai/any-llm,
mostlygeek/llama-swap, docker/model-runner); Docker Model Runner GA blog; DeepSeek privacy
policy; Z.AI privacy policy. Full URL list in the r2 research transcript.
