"""docBox NER sidecar — the clinical named-entity and assertion service (ADR-012).

A small FastAPI service the TypeScript control plane reaches over its API
(ADR-009 module shape). It exposes:

    GET  /health   -> {"status": "ok"}
    GET  /         -> {"service", "mode", "labels"}   (ops metadata)
    POST /ner      -> {"entities": [{text,label,start,end,score,assertion}, ...]}

``POST /ner`` accepts ``{"text": "..."}`` and returns entities with
character-accurate offsets, matching the contract in
``server/src/corpus/ner-client.ts``: ``{text} -> {entities:[{text,label,start,end,score}]}``.
Each entity also carries an ``assertion`` field (affirmed | negated | possible)
that the grounding layer may use to drop negated findings.

Two backends sit behind one switch, ``NER_MODE``:

  * ``rules``  (default) — the deterministic offline annotator in ``annotator.py``.
    No model download, so the demo and CI have a working endpoint immediately.
  * ``models``           — the OpenMed pinned checkpoints + medspaCy in
    ``models_backend.py``. Loads weights from a mounted volume with pinned
    revisions; see README and models.example.json.
"""

from __future__ import annotations

import os
from typing import List

from fastapi import FastAPI
from pydantic import BaseModel, Field

import annotator

NER_MODE = os.environ.get("NER_MODE", "rules").strip().lower()

# The normalised label vocabulary both backends emit, so a consumer sees the same
# labels whichever path is active.
LABELS = [
    "DRUG", "DOSE", "FREQUENCY", "DISEASE", "LAB", "LAB_VALUE",
    "ALLERGEN", "ANATOMY", "VITAL",
]

app = FastAPI(title="docBox NER sidecar", version="1.0.0")

_backend = None  # lazily-built models backend when NER_MODE=models


class NerRequest(BaseModel):
    text: str = Field(default="", description="The document text to annotate.")


class EntityOut(BaseModel):
    text: str
    label: str
    start: int
    end: int
    score: float
    assertion: str = "affirmed"


class NerResponse(BaseModel):
    entities: List[EntityOut]


def _get_backend():
    """Build the models backend on first use; rules mode needs no backend."""
    global _backend
    if NER_MODE != "models":
        return None
    if _backend is None:
        from models_backend import ModelsBackend

        _backend = ModelsBackend()
    return _backend


@app.on_event("startup")
def _startup() -> None:
    # Fail fast in models mode: load the pinned checkpoints at startup so a bad
    # pin or missing weights surfaces before the first request, not during a demo.
    if NER_MODE == "models":
        _get_backend()


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/")
def root() -> dict:
    return {"service": "docbox-ner", "mode": NER_MODE, "labels": LABELS}


@app.post("/ner", response_model=NerResponse)
def ner(req: NerRequest) -> NerResponse:
    if NER_MODE == "models":
        entities = _get_backend().annotate(req.text)
    else:
        entities = annotator.annotate(req.text)
    return NerResponse(entities=[EntityOut(**e.as_dict()) for e in entities])
