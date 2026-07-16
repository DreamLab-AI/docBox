---
name: OCR for messy handwriting on forms — permissive, self-hostable
category: models-and-gateways
round: 3
researcher: main session (verified via perplexity 2026-07-16)
verified: 2026-07-16
recommendation: local route (Qwen-VL, Apache-2.0) is the private in-box default served like the local text model; cloud OCR (openai | mistral | gemini) is available per project and more accurate; PaddleOCR+TrOCR escalation for field crops; confidence-scored human review because no model, open or cloud, reads truly messy handwriting cleanly
---

# OCR that handles bad handwriting on forms

Verified 2026-07-16. The honest headline first.

## Honest limits

**No open-weight model is good at truly messy handwriting.** Cloud vision models (GPT-5.5 Vision,
Claude, Gemini) lead on accuracy and are available for OCR on every project; the in-box local route
is the private option, chosen when a document's sensitivity means it cannot leave the box. On
doctor-handwriting studies the best open engines reach only ~20% exact match; generic VLMs run
~52% below supervised OCR on handwriting, and even the cloud leaders trail supervised OCR on the
worst inputs. So the design must include **confidence scoring and human review of low-confidence
fields** on either route, not a promise of hands-off accuracy. Say this to the client plainly.

## Permissive contenders

| Option | Licence | Handwriting | Self-host | Endpoint |
|---|---|---|---|---|
| **Qwen2.5-VL-7B / Qwen3-VL** | Apache-2.0 | Best single-model on messy handwriting + forms (~75% on clear, drops on messy) | ~12-16GB GPU | OpenAI-compatible via vLLM/Ollama |
| **TrOCR / DTrOCR** (Microsoft) | MIT | Best open HTR for line/field crops when fine-tuned (DTrOCR ~2.4% CER on IAM) | single 12-16GB | wrap as REST |
| **PaddleOCR / PP-OCRv5 / PaddleOCR-VL** | Apache-2.0 | Strong print + layout + tables; OK handwriting (~82% F1) | ~3.3GB, fast | REST/JSON |
| DeepSeek-OCR | permissive | mixed print+annotation, partial on cursive | ~8GB | Ollama/HF |
| GOT-OCR2.0 | check per checkpoint | SOTA print, weak on cursive | 16-24GB | REST |
| olmOCR (AllenAI) | MIT tooling | good layouts, ⚠️ messy handwriting, slow | ~16GB | HF |
| **Surya** | **GPL-3.0 — excluded** | good handwriting (~85% F1) | — | — |
| docTR (Mindee) | Apache-2.0 | ~80% F1, print-leaning | 8-12GB | REST |
| Tesseract / EasyOCR | Apache/ — | unusable on messy cursive | CPU | — |

## Recommended design

**Local-route default (single model, best reuse)**: **Qwen-VL** served by the *same*
OpenAI-compatible runtime as the local text model (vLLM/Ollama). One serving pattern for both text
and OCR; the OCR "model" on the `local` route is just a multimodal in-box model. Cloud routes
(openai | mistral | gemini) are peers on `ocr.route`, more accurate on hard inputs. Send a page
image, get structured text back.

**Escalation pipeline (for the hardest forms)**:
1. **PaddleOCR / PP-Structure** (Apache-2.0) — detect regions, parse layout and form fields,
   extract crops.
2. **TrOCR / DTrOCR** (MIT) — recognise handwritten field crops; fine-tune on the client's forms.
3. **Qwen-VL** — context fallback for low-confidence fields (map handwriting to the schema).
4. **Human review** — route fields below a confidence threshold to a person.

All three model families are MIT/Apache-2.0. Start with Qwen-VL alone; add the pipeline only when
edge cases demand it (maintainability steer).

## Wiring in the product

- Config (Providers tab, OCR group): `ocr.route` (local | openai | mistral | gemini: the
  per-feature switch, live-class, set per project against document sensitivity), `ocr.enabled`,
  `ocr.model` (local-route weights: qwen2.5-vl-7b default, qwen3-vl, paddleocr-vl, deepseek-ocr),
  `ocr.endpoint` (OpenAI-compatible, in-box, used by the local route), `ocr.confidence_review`
  (route low-confidence fields to human review on either route: default on).
- Compose: a `local-ocr` service, same serving pattern as `local-model`, loopback-bound on
  agent-net, GPU reservation commented for the larger VLMs.
- Documents flow: upload → store (per project, on the user-data plane) → OCR → text + per-field
  confidence available to the agent and shown in the Documents surface.

## Sources

perplexity synthesis 2026-07-16 across codesota, modal, gigagpu, spheron, HuggingFace OCR
knowledge base, arXiv 2305.07895 (LMM OCR eval), doctor-handwriting study. Full list in the
round-3 research transcript.
