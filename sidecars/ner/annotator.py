"""Offline clinical annotator — the default ``rules`` path of the NER sidecar.

This is the deterministic dictionary-and-regex annotator that runs with no model
download, so the demonstrator and CI have a working /ner endpoint out of the box
(ADR-012 layer choice: a rule-based assertion layer is deterministic and
inspectable, which suits the audit register). It recognises the entity families
the synthetic corpus (``app/src/data/corpus.ts``) carries — drugs, doses,
administration frequencies, conditions, laboratory analytes and their values,
allergens, anatomy and a blood-pressure vital — and returns character-accurate
offsets so that ``quote == text[start:end]`` holds by construction (DDD-004 inv.).

It has no third-party dependency, so ``app.py`` can wire it behind FastAPI and the
tests can exercise the recognition logic directly without a web framework present.

Assertion status (affirmed / negated / possible) is decided by a small NegEx and
ConText-style rule set scoped to the clause a term sits in — enough to keep
"ruled out for acute coronary syndrome" from becoming an ACS finding while
leaving "chest pain" in the same sentence affirmed.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List, Tuple

# ── The emitted entity ────────────────────────────────────────────────────────


@dataclass
class Entity:
    """One recognised span. The first five fields are the wire contract shared
    with ``server/src/corpus/ner-client.ts`` (``{text,label,start,end,score}``);
    ``assertion`` is an extra field the grounding layer may read to drop negated
    findings. ``quote == source_text[start:end]`` always holds."""

    text: str
    label: str
    start: int
    end: int
    score: float
    assertion: str = "affirmed"  # affirmed | negated | possible

    def as_dict(self) -> dict:
        return {
            "text": self.text,
            "label": self.label,
            "start": self.start,
            "end": self.end,
            "score": self.score,
            "assertion": self.assertion,
        }


# ── Vocabulary ────────────────────────────────────────────────────────────────
# Terms are matched case-insensitively on word boundaries. Longer terms win over
# shorter overlapping ones ("essential hypertension" over "hypertension",
# "coronary artery disease" over the "coronary artery" anatomy inside it), which
# the overlap resolver below handles by preferring the longer span.

DRUGS: List[str] = [
    "amlodipine", "atorvastatin", "paracetamol", "bisoprolol", "ramipril",
    "lisinopril", "simvastatin", "rosuvastatin", "metformin", "clopidogrel",
    "furosemide", "warfarin", "apixaban", "rivaroxaban", "omeprazole",
    "lansoprazole", "atenolol", "losartan", "spironolactone",
    "digoxin", "gliclazide", "levothyroxine", "salbutamol", "prednisolone",
]

# Substances that read as an allergen when the surrounding sentence talks about
# an allergy, and as a drug otherwise.
DUAL_SUBSTANCES: List[str] = [
    "penicillin", "amoxicillin", "co-amoxiclav", "aspirin", "ibuprofen",
    "codeine", "morphine", "cephalosporin", "erythromycin", "gentamicin",
]

# Substances that are only ever an allergen in this domain.
ALLERGENS_ONLY: List[str] = [
    "latex", "sulfonamide", "sulphonamide", "nut", "peanut", "shellfish",
    "iodine", "elastoplast",
]

CONDITIONS: List[str] = [
    "essential hypertension", "hypertension", "hypertensive",
    "stable angina", "unstable angina", "angina",
    "acute coronary syndrome", "coronary artery disease",
    "ischaemic heart disease", "myocardial infarction", "chest pain",
    "atrial fibrillation", "heart failure", "hyperlipidaemia",
    "hypercholesterolaemia", "type 2 diabetes", "type 1 diabetes", "diabetes",
    "chronic kidney disease", "acute kidney injury", "asthma",
    "chronic obstructive pulmonary disease", "stroke",
]

ANATOMY: List[str] = [
    "coronary arteries", "coronary artery", "left ventricle", "right ventricle",
    "myocardium", "aorta", "carotid artery", "left atrium", "right atrium",
]

LABS: List[str] = [
    "urea and electrolytes", "full blood count", "liver function tests",
    "potassium", "sodium", "creatinine", "urea", "electrolytes", "haemoglobin",
    "cholesterol", "triglycerides", "troponin", "hba1c", "platelets",
    "white cell count", "bilirubin", "albumin", "glucose", "egfr",
]

FREQUENCY_PHRASES: List[str] = [
    "once daily", "twice daily", "three times daily", "four times daily",
    "once a day", "twice a day", "at night", "in the morning", "as required",
    "when required", "once weekly", "as directed", "nocte", "mane",
]

# Latin dosing abbreviations, matched case-sensitively so they do not fire inside
# ordinary words.
FREQUENCY_ABBREV: List[str] = ["OD", "BD", "TDS", "QDS", "PRN"]

# ── Regex patterns ────────────────────────────────────────────────────────────

# A dose: a number and an amount unit (5mg, 10 mg, 1g, 500mcg, 20 units).
DOSE_RE = re.compile(
    r"\b\d+(?:\.\d+)?\s?(?:mg|mcg|microgram(?:s)?|g|ml|unit(?:s)?)\b",
    re.IGNORECASE,
)

# A laboratory value: a number and a concentration/pressure unit (5.9 mmol/L).
LAB_VALUE_RE = re.compile(
    r"\b\d+(?:\.\d+)?\s?(?:mmol/L|umol/L|µmol/L|mg/L|g/L|ng/mL|IU/L|mmHg|%)",
    re.IGNORECASE,
)

# A blood-pressure reading (168/98). The lookahead stops it swallowing the first
# two groups of a date such as 10/03/2023; a sentence-level context gate (below)
# keeps a bare "03/06" date fragment from reading as a vital.
BP_RE = re.compile(r"\b\d{2,3}/\d{2,3}(?!/?\d)")
BP_CONTEXT = re.compile(r"blood pressure|\bBP\b", re.IGNORECASE)

# ── Assertion triggers ────────────────────────────────────────────────────────
# Scoped to the clause a term sits in. Forward triggers precede the term;
# backward triggers (a later refutation of the same clause) follow it.

FORWARD_NEG = [
    re.compile(p, re.IGNORECASE) for p in (
        r"\bno known\b", r"\bno evidence of\b", r"\bnegative for\b",
        r"\bruled out\b", r"\babsence of\b", r"\bfree of\b", r"\bwithout\b",
        r"\bdenies\b", r"\bno\b", r"\bnot\b",
    )
]

BACKWARD_NEG = [
    re.compile(p, re.IGNORECASE) for p in (
        r"\bnot supported\b", r"\brefuted\b", r"\bexcluded\b",
        r"\bnot confirmed\b", r"\bruled out\b",
    )
]

FORWARD_POSSIBLE = [
    re.compile(p, re.IGNORECASE) for p in (
        r"\bworking diagnosis of\b", r"\bquery\b", r"\bpossible\b",
        r"\bprobable\b", r"\bsuggestive of\b", r"\bcannot exclude\b",
        r"\bdifferential\b", r"\?",
    )
]

CLAUSE_SEP = re.compile(r"[,;:.\n]")
SENTENCE_SEP = re.compile(r"[.\n]")


def _segments(text: str, sep: re.Pattern) -> List[Tuple[int, int]]:
    """Non-separator runs of ``text`` as (start, end) spans."""
    segs: List[Tuple[int, int]] = []
    start = 0
    for m in sep.finditer(text):
        if m.start() > start:
            segs.append((start, m.start()))
        start = m.end()
    if start < len(text):
        segs.append((start, len(text)))
    return segs


def _containing(segs: List[Tuple[int, int]], pos: int, length: int) -> Tuple[int, int]:
    for s, e in segs:
        if s <= pos and pos < e:
            return s, e
    return 0, length


# ── Candidate collection ──────────────────────────────────────────────────────


@dataclass
class _Candidate:
    start: int
    end: int
    label: str
    score: float
    # Higher wins when two candidates cover the same characters at equal length.
    priority: int = 0


def _dict_candidates(text: str, terms: List[str], label: str, score: float,
                     case_sensitive: bool, priority: int) -> List[_Candidate]:
    out: List[_Candidate] = []
    flags = 0 if case_sensitive else re.IGNORECASE
    for term in terms:
        pattern = re.compile(r"\b" + re.escape(term) + r"\b", flags)
        for m in pattern.finditer(text):
            out.append(_Candidate(m.start(), m.end(), label, score, priority))
    return out


def _regex_candidates(text: str, pattern: re.Pattern, label: str, score: float,
                      priority: int) -> List[_Candidate]:
    return [
        _Candidate(m.start(), m.end(), label, score, priority)
        for m in pattern.finditer(text)
    ]


def annotate(text: str) -> List[Entity]:
    """Recognise clinical entities in ``text`` and return them sorted by offset."""
    if not text:
        return []

    sentences = _segments(text, SENTENCE_SEP)
    clauses = _segments(text, CLAUSE_SEP)

    candidates: List[_Candidate] = []
    # Multi-word dictionary families get a higher priority than the abbreviations
    # and single tokens so a longer clinical phrase is preferred on a tie.
    candidates += _dict_candidates(text, CONDITIONS, "DISEASE", 0.95, False, 5)
    candidates += _dict_candidates(text, ANATOMY, "ANATOMY", 0.95, False, 3)
    candidates += _dict_candidates(text, LABS, "LAB", 0.95, False, 4)
    candidates += _dict_candidates(text, DRUGS, "DRUG", 0.95, False, 4)
    candidates += _dict_candidates(text, ALLERGENS_ONLY, "ALLERGEN", 0.95, False, 4)
    candidates += _dict_candidates(text, DUAL_SUBSTANCES, "DRUG", 0.95, False, 4)
    candidates += _dict_candidates(text, FREQUENCY_PHRASES, "FREQUENCY", 0.9, False, 2)
    candidates += _dict_candidates(text, FREQUENCY_ABBREV, "FREQUENCY", 0.9, True, 2)
    candidates += _regex_candidates(text, DOSE_RE, "DOSE", 0.92, 3)
    candidates += _regex_candidates(text, LAB_VALUE_RE, "LAB_VALUE", 0.92, 3)
    # A "x/y" reading is only a vital when its sentence talks about blood pressure;
    # otherwise it is a date fragment (e.g. "given 03/06") and is left alone.
    for cand in _regex_candidates(text, BP_RE, "VITAL", 0.9, 1):
        s_start, s_end = _containing(sentences, cand.start, len(text))
        if BP_CONTEXT.search(text[s_start:s_end]):
            candidates.append(cand)

    # Overlap resolution: sort by start, then longer span first, then priority.
    candidates.sort(key=lambda c: (c.start, -(c.end - c.start), -c.priority))
    accepted: List[_Candidate] = []
    for cand in candidates:
        if any(cand.start < a.end and cand.end > a.start for a in accepted):
            continue
        accepted.append(cand)

    accepted.sort(key=lambda c: c.start)

    entities: List[Entity] = []
    for cand in accepted:
        span_text = text[cand.start:cand.end]
        label = cand.label
        # Re-label a dual-use substance as an allergen when its sentence is about
        # an allergy ("penicillin allergy", "Allergy: penicillin").
        if _is_dual(span_text):
            s_start, s_end = _containing(sentences, cand.start, len(text))
            if "allerg" in text[s_start:s_end].lower():
                label = "ALLERGEN"
        assertion = _classify(text, cand.start, cand.end, clauses)
        entities.append(
            Entity(span_text, label, cand.start, cand.end, cand.score, assertion)
        )
    return entities


def _is_dual(span_text: str) -> bool:
    return span_text.lower() in {s.lower() for s in DUAL_SUBSTANCES}


def _classify(text: str, start: int, end: int,
              clauses: List[Tuple[int, int]]) -> str:
    c_start, c_end = _containing(clauses, start, len(text))
    before = text[c_start:start]
    after = text[end:c_end]
    if any(p.search(before) for p in FORWARD_NEG) or any(p.search(after) for p in BACKWARD_NEG):
        return "negated"
    if any(p.search(before) for p in FORWARD_POSSIBLE):
        return "possible"
    return "affirmed"


def annotate_dicts(text: str) -> List[dict]:
    """Convenience wrapper returning plain dicts for the HTTP layer."""
    return [e.as_dict() for e in annotate(text)]
