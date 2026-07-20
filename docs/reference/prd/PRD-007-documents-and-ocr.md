# PRD-007 — Documents and OCR

Status: Draft · Owner: DreamLab · Created 2026-07-16 · Realises PRD-000 (Documents surface) · Supersedes: none

## Summary

A primary user drops a document into the sandbox: a scanned form, a photographed page, a PDF. It
lands in the project's user-data plane, gets read by OCR, and the extracted text becomes context
the agent can work with. An operator watches the same documents from Foreman, sets how each
project's OCR is routed, and clears the review queue when a field comes back uncertain.

If you remember one thing: **messy handwriting beats every open model and most cloud ones, so the
design scores confidence per field and routes the doubtful ones to a person**, rather than
promising hands-off accuracy nobody can deliver.

## Problem

The agent is only as useful as the material it can see. A client's real work arrives as documents
(intake forms, contracts, handwritten notes, scans), and today none of it reaches the agent
without a person retyping it. Two things stand in the way:

- Ingestion has no home. A document needs a place to land, per project, on the plane that
  snapshots and rollback protect, with the agent able to read the result and the operator able to
  audit it.
- OCR on messy handwriting is genuinely hard. Independent studies put the best open engines near
  20% exact match on doctor-grade handwriting, and even cloud vision models trail supervised OCR
  on the worst inputs (corpus/07 ocr-handwriting). A product that claimed clean extraction here
  would be lying.

## Goals

1. Accept a document upload per project, store it on the user-data plane, and make its OCR text
   available to the agent.
2. Run OCR through a routed pipeline whose default is the in-box vision model, with a cloud route
   available per project.
3. Score every extracted field for confidence and route low-confidence fields to human review
   before the agent trusts them.
4. Give the operator a Documents surface in Foreman and the primary user a documents view inside
   their editor, per ADR-007.
5. Offer a per-feature route switch so OCR, like the agent, can run local for private material or
   cloud for accuracy, chosen by the operator.

## Non-goals

- Training or fine-tuning OCR models in this milestone. We serve existing weights; client-specific
  fine-tuning of TrOCR is a later step, noted where it belongs.
- A document management system: versioning, workflow, e-signature. This is ingest-for-the-agent,
  not a DMS.
- Redefining the two surfaces. ADR-007 owns the split between the Foreman tab and the editor
  extension; this PRD consumes that decision.
- The audit and vault mechanics themselves (PRD-006). Documents inherit them; this PRD does not
  reimplement them.

## Users and jobs

| User | Job this does |
|---|---|
| Primary user | Upload a document, watch it get read, ask the agent about its contents |
| Operator / admin | Set the OCR route per project, monitor ingest, clear the low-confidence review queue |
| Reviewer / compliance | Trace which documents an agent read and confirm sensitive material stayed in-box |

## Feature sets

Each set states when and why to use it; the surfaces repeat that guidance in place.

### Upload and ingest
Use it whenever a document needs to reach the agent. An upload lands in the project's user-data
plane, is recorded in the audit trail as an ingest event, and enters the OCR queue. Storage is per
project, so a document is scoped to the project vault that owns it and never bleeds across tenants.

### OCR and extraction
Use it to turn a page image into text the agent can read. Default routing sends the page to the
in-box vision model (Qwen-VL) over the same OpenAI-compatible runtime the local text model uses.
Output is text plus a per-field confidence score, not a flat blob, so downstream steps can reason
about which parts are trustworthy.

### Escalation pipeline
Use it only when a form defeats the single-model default. Layout parsing (PaddleOCR / PP-Structure)
crops the fields, a handwriting recogniser (TrOCR) reads each crop, and the vision model maps
stubborn fields back to the form schema. Start with the default alone and add the pipeline when a
client's forms demand it; maintainability outranks capability (PRD-000).

### Human review
Use it whenever a field returns below the confidence threshold. Doubtful fields queue for a person
in the operator surface, and the agent does not treat an unreviewed low-confidence field as fact.
Review is on by default, because silent wrong extraction is worse than a visible gap.

### Agent access
Use it to bring a document into a session. Once OCR clears review, the text and its confidence map
are available to the agent as project context, attributed in the audit trail to the document and
the owner who uploaded it.

## Per-feature route switch (core requirement)

Cloud models are available for every feature. Each feature carries its own route switch whose
`local` value is the private in-box option and whose other values are cloud providers, as peers
rather than fallbacks. The operator picks the route per project against the sensitivity of the
material, not once for the whole box.

| Feature | Switch | Values | `local` is |
|---|---|---|---|
| Agent (text) | model route (PRD-003) | anthropic · openai · google · local | the embedded model (Gemma 4 / gpt-oss / Qwen) |
| OCR | `ocr.route` | local · openai · mistral · gemini | Qwen-VL in-box |
| Future features | `<feature>.route` | provider peers · local | the in-box option |

Reading of the switch:

- `local` keeps every page inside the box, chosen when a document's sensitivity requires it
  (regulated data, confidential intake).
- A cloud route is more accurate on hard inputs and is the right call for low-sensitivity material
  where accuracy matters more than residency.
- Because the choice is per project and live-class (PRD-001), an operator can send routine scans to
  a cloud OCR while keeping a sensitive project's documents on the in-box model, at the same time.

Which weights `local` serves is itself a config choice (`models.local.name`). Gemma 4 (Apache-2.0,
from the 31B dense down to the E4B edge build) is the quality default, and OpenAI's gpt-oss ships
alongside it as defence in depth — a second open-weights lineage on the same switch, for clients who
want OpenAI-class reasoning with nothing leaving the box, and as a cross-check on the primary
model's output. The Qwen builds remain the CPU-class floor.

This is the honest position: cloud is allowed everywhere and usually more accurate; local is the
private option offered on every feature's switch, taken when the data cannot leave.

## OCR accuracy, stated honestly

No open-weight model reads truly messy handwriting well, and cloud vision leads but does not solve
it. So accuracy is a property of the routed pipeline plus review, never a promise from the model
alone:

- Clear print and forms: the in-box model handles most of it, and a cloud route lifts the hardest
  cases.
- Messy handwriting: expect gaps on either route, so confidence scoring plus human review is what
  makes the output safe to use.
- Say this to the client plainly (corpus/07): the design earns trust by flagging what it is unsure
  of, not by overstating what it read.

## Surfaces

ADR-007 decides the two-surface split; this PRD wires each surface to the features above without
redefining that decision.

- **Foreman Documents tab** (operator / admin): the box-owner's view. Ingest status per project,
  the OCR route setting, the low-confidence review queue, and the audit link for each document. Use
  it to run ingest across projects and to keep sensitive material on the in-box route.
- **code-server Companion extension** (primary user): the day-to-day view inside the editor the
  user already has. Upload a document, watch OCR progress, read the extracted text, and hand it to
  the agent. Use it as the primary-user path, so uploading a document feels like part of the work
  rather than a separate admin tool.

## Success criteria

- A document uploaded through the Companion extension lands on the user-data plane and appears in
  the Foreman Documents tab within a session.
- OCR output carries a per-field confidence score, and fields below threshold appear in the review
  queue rather than reaching the agent as fact.
- Switching `ocr.route` between `local` and a cloud provider is a live-class config change, applied
  per project, with no rebuild.
- A document routed to `local` emits no request off the box, provable from the egress record
  (PRD-005).
- The agent can read a cleared document's text as context, attributed to the document and uploader
  in the audit trail.

## Open questions (for the client brief)

- Which cloud OCR providers survive procurement, and does any client mandate `local` for all
  documents?
- What confidence threshold defines "needs review", and is it per client or per form type?
- Retention: how long do source images live on the user-data plane after OCR, and who may delete
  them?

## Traceability

Realises PRD-000 (Documents surface). Surface split: ADR-007. OCR research and honest limits:
corpus/07 ocr-handwriting; in-box model serving: corpus/07 openai-gpt-oss, local-models-and-gateway.
Storage plane and audit: PRD-006, DDD-002, corpus/10. Route-switch apply-class: PRD-001, ADR-002.
Network egress proof: PRD-005. Domain vocabulary: DDD-001.
