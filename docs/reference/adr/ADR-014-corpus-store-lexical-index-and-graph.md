# ADR-014 — Corpus Store, Lexical Index and Entity Graph

Status: Accepted · Date: 2026-07-17 · Deciders: DreamLab

## Context

[ADR-011](./ADR-011-context-native-retrieval.md) makes deterministic tools the reading mesh's
shared workspace and forbids an embedding backbone. This ADR decides what those tools concretely
are, what stores them, and where that store sits relative to the user-data plane.

The requirements follow from the product: exact-token finding for the things clinicians actually
query crisply — drug names, identifiers, dates, dm+d and LOINC codes — where similarity search
blurs precisely what must stay sharp; ranking a human can audit; results that map onto
EvidenceSpans, since character-level provenance is the citation primitive; near-zero infrastructure
under the distillation rule ([PRD-000](../prd/PRD-000-product-shape.md): maintainability outranks
capability); and everything reachable from the TypeScript control plane.

## Decision

**Three deterministic tools over one embedded store.**

**1. SQLite FTS5 is the lexical index.** Built-in BM25 ranking (`bm25()`), phrase, prefix and
`NEAR` operators; public domain; embedded in-process via `better-sqlite3` or `node:sqlite`. Two
surfaces are indexed: the raw OCR/extracted text of every SourceDocument, addressable by character
offset so every hit maps directly onto an EvidenceSpan, and the Claims themselves, so a Specialist
can search structured assertions and raw prose with the same instrument. BM25 over exact tokens is
the right tool for "amlodipine", "K+ 6.2", an NHS number or a date — deterministic, explainable,
and immune to the near-miss retrieval that similarity scoring invites.

**2. A per-document hierarchical tree**, in the PageIndex style: nodes of
`{ title, summary, page/char range, id }` mirroring the document's real structure — a clinic
letter's sections, a discharge summary's blocks, a report's findings and conclusion.
Embedding-free by construction; a Specialist navigates by reading node titles and summaries and
descending, the way a person skims a document, not by ranking vectors. PageIndex (VectifyAI, MIT)
is the verified embedding-free template but is Python-only, so its shape is implemented in
TypeScript rather than wrapping the package.

**3. A typed entity graph — constructed, never embedded.** Nodes are the entities the grounding
stack emits ([ADR-012](./ADR-012-clinical-grounding-stack.md)) after reconciliation; edges are
typed clinical relations (treats, indicates, supersedes, references, contradicts). Construction
borrows the one part of the GraphRAG family that needs no embeddings — LLM/NLP entity and relation
extraction at ingestion time — and traversal is a plain graph walk. **No node or edge carries a
vector.**

Together these three are the shared workspace of
[PRD-011](../prd/PRD-011-clinician-query-and-reading-mesh.md)'s reading mesh: how Specialists pull
exact passages into context and cite them, not a ranking layer that decides what a model sees.

**4. Placement and protection.** The store is **derived data in the user-data plane**: a single
SQLite file living beside the SourceDocuments it indexes, inside snapshot scope
([ADR-006](./ADR-006-snapshot-store.md)). A snapshot therefore captures corpus and derived store
together, and rollback restores them consistently — an index can never outlive or contradict the
documents it points into. Because every table is rebuildable by re-running ingestion
([PRD-010](../prd/PRD-010-clinical-grounding-pipeline.md)), the store is disposable: a corrupt or
stale index is deleted and rebuilt from source, never repaired in place.

**5. Store-level invariant: no embedding index anywhere.** No vector column, no embedding table, no
ANN extension. This restates ADR-011 as a property of the store so it cannot be quietly
reintroduced as an implementation detail; changing it means superseding ADR-011 first.

## Alternatives considered

- **tantivy (MIT)** — a Lucene-class engine in Rust; faster and richer at scale, but it adds a
  native build artefact and an index-service surface that FTS5 avoids entirely. Named as the
  escalation path if FTS5 is ever outgrown; a single-patient corpus of 50–100 documents will not
  get there.
- **ParadeDB (Postgres + tantivy)** — attractive where Postgres already runs, and the development
  environment's RuVector does run Postgres. But docBox is a distillation, not agentbox: adopting a
  database *service* to index one patient's documents inverts the maintainability rule. Embedded
  SQLite gives zero infrastructure, one file, and a snapshot story for free.
- **A vector database** — rejected by ADR-011; listed here only so the store decision records the
  exclusion at its own level rather than inheriting it silently.

## Consequences

- The mesh's entire toolset is deterministic and inspectable. A BM25 rank, a tree path and a graph
  walk each explain themselves in an audit trail; there is no "the vector said so" step anywhere
  between a Question and a CitedAnswer.
- One file to snapshot, back up, or delete-and-rebuild. Recovery from any index defect is
  re-ingestion, which is also the test of the grounding pipeline itself.
- FTS5 tokeniser configuration (unicode61 with tuned token characters) matters for clinical text —
  hyphenated drug names, units, coded identifiers — and is owned by PRD-010's ingestion spec, not
  left to defaults.
- No embedding model exists anywhere in the corpus path, so there is no model-version drift, no
  re-embedding cost on ingestion, and no stale-index failure class at all.

## Traceability

Tool choices grounded in the RuVector digest `docbox-research-retrieval` (FTS5 as default lexical
tool; PageIndex as the embedding-free template; graph construction borrowed, vector ranking
dropped). Workspace role fixed by [ADR-011](./ADR-011-context-native-retrieval.md); entity supply
from [ADR-012](./ADR-012-clinical-grounding-stack.md); the Claims it indexes are shaped by
[ADR-013](./ADR-013-fhir-record-and-terminology-mount.md). Built and populated by
[PRD-010](../prd/PRD-010-clinical-grounding-pipeline.md), consumed by
[PRD-011](../prd/PRD-011-clinician-query-and-reading-mesh.md), modelled in
[DDD-004](../ddd/DDD-004-clinical-corpus-domain.md). Snapshot protection inherits
[ADR-006](./ADR-006-snapshot-store.md).
