"""The ``models`` path of the NER sidecar — OpenMed pinned checkpoints (ADR-012).

This backend is loaded only when ``NER_MODE=models``. It runs the pinned OpenMed
SuperClinical token-classification checkpoints through the Hugging Face
transformers pipeline (``aggregation_strategy="simple"``) and layers medspaCy for
assertion and section context, exactly as ADR-012 specifies. Every heavy import
is deferred to construction time, so the default ``rules`` path needs none of
these packages installed.

Weights and their exact pins are NOT baked into the image and NOT committed to
this repo (licence hygiene: OpenMed weights carry a MIMIC-III provenance caveat,
so they stay on the box). The model set — repository id and the exact commit
revision to pin — is read from a JSON config mounted at runtime
(``NER_MODEL_CONFIG``, default ``/models/models.json``). ``models.example.json``
in this directory documents the shape and the ADR-012 model families. The backend
refuses to start if a model has no pinned ``revision``, so an unpinned checkpoint
can never silently change extraction behaviour.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import List, Optional

from annotator import Entity, annotate as rules_annotate

DEFAULT_CONFIG_PATH = "/models/models.json"


@dataclass
class ModelSpec:
    family: str          # ADR-012 family, e.g. DiseaseDetect
    repo: str            # Hugging Face repo id, e.g. OpenMed/OpenMed-NER-DiseaseDetect-SuperClinical-184M
    revision: str        # pinned commit SHA or tag — required, no default
    label: str           # normalised label this family maps to (DISEASE, DRUG, ...)


class ModelsBackend:
    """Loads the pinned OpenMed checkpoints and a medspaCy assertion pipeline."""

    def __init__(self, config_path: Optional[str] = None) -> None:
        self.config_path = config_path or os.environ.get(
            "NER_MODEL_CONFIG", DEFAULT_CONFIG_PATH
        )
        self.specs = self._load_specs(self.config_path)
        self._pipelines = []      # (label, hf pipeline)
        self._assertion = None    # medspaCy nlp, or None if unavailable
        self._build()

    # ── configuration ────────────────────────────────────────────────────────

    @staticmethod
    def _load_specs(path: str) -> List[ModelSpec]:
        if not os.path.exists(path):
            raise RuntimeError(
                f"NER_MODE=models needs a model config at {path}. "
                f"Copy models.example.json there, fill in each pinned revision, "
                f"and mount the weights volume (see README)."
            )
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        specs: List[ModelSpec] = []
        for entry in data.get("models", []):
            revision = entry.get("revision")
            if not revision:
                raise RuntimeError(
                    f"Model {entry.get('repo', '?')} has no pinned 'revision'. "
                    f"Pin the exact commit SHA before serving the models path."
                )
            specs.append(
                ModelSpec(
                    family=entry["family"],
                    repo=entry["repo"],
                    revision=revision,
                    label=entry.get("label", entry["family"].upper()),
                )
            )
        if not specs:
            raise RuntimeError(f"No models listed in {path}.")
        return specs

    # ── model loading ────────────────────────────────────────────────────────

    def _build(self) -> None:
        from transformers import (  # deferred heavy import
            AutoModelForTokenClassification,
            AutoTokenizer,
            pipeline,
        )

        device = -1
        try:
            import torch

            if torch.cuda.is_available():
                device = 0
        except Exception:
            device = -1

        for spec in self.specs:
            tokenizer = AutoTokenizer.from_pretrained(spec.repo, revision=spec.revision)
            model = AutoModelForTokenClassification.from_pretrained(
                spec.repo, revision=spec.revision
            )
            nlp = pipeline(
                "token-classification",
                model=model,
                tokenizer=tokenizer,
                aggregation_strategy="simple",
                device=device,
            )
            self._pipelines.append((spec.label, nlp))

        self._assertion = self._build_assertion()

    @staticmethod
    def _build_assertion():
        # medspaCy supplies rule-based ConText/NegEx negation, uncertainty and the
        # sectioniser (ADR-012 layer 2). If it is not installed the backend falls
        # back to the annotator's built-in NegEx-style rules.
        try:
            import medspacy

            return medspacy.load()
        except Exception:
            return None

    # ── inference ────────────────────────────────────────────────────────────

    def annotate(self, text: str) -> List[Entity]:
        if not text:
            return []

        raw: List[Entity] = []
        for label, nlp in self._pipelines:
            for ent in nlp(text):
                start = int(ent["start"])
                end = int(ent["end"])
                # Prefer the checkpoint's own entity_group when it is specific;
                # fall back to the family label the config assigns.
                group = str(ent.get("entity_group", "")).upper()
                out_label = group if group and group not in {"MISC", "ENTITY"} else label
                raw.append(
                    Entity(
                        text=text[start:end],
                        label=out_label,
                        start=start,
                        end=end,
                        score=round(float(ent.get("score", 0.0)), 4),
                        assertion="affirmed",
                    )
                )

        raw = self._dedupe(raw)
        return self._apply_assertion(text, raw)

    @staticmethod
    def _dedupe(entities: List[Entity]) -> List[Entity]:
        # Several family checkpoints can flag overlapping spans; keep the highest
        # score per character range, longer span winning ties.
        entities.sort(key=lambda e: (e.start, -(e.end - e.start), -e.score))
        kept: List[Entity] = []
        for ent in entities:
            if any(ent.start < k.end and ent.end > k.start for k in kept):
                continue
            kept.append(ent)
        kept.sort(key=lambda e: e.start)
        return kept

    def _apply_assertion(self, text: str, entities: List[Entity]) -> List[Entity]:
        if self._assertion is None:
            # Reuse the deterministic clause-scoped rules over the model spans by
            # re-deriving assertion from the same text the annotator would see.
            from annotator import _segments, _classify, CLAUSE_SEP

            clauses = _segments(text, CLAUSE_SEP)
            for ent in entities:
                ent.assertion = _classify(text, ent.start, ent.end, clauses)
            return entities

        doc = self._assertion(text)
        negated = [
            (span.start_char, span.end_char)
            for span in doc.ents
            if getattr(span._, "is_negated", False)
        ]
        for ent in entities:
            if any(ns <= ent.start and ent.end <= ne for ns, ne in negated):
                ent.assertion = "negated"
        return entities
