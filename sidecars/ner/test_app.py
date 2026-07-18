"""Tests for the NER sidecar rules path.

The recognition logic in ``annotator.py`` has no third-party dependency, so those
tests always run. The HTTP tests are skipped automatically when FastAPI / httpx
are not installed in the environment, so ``python -m pytest -q`` works in a
rules-only checkout as well as a full one.

Sample text is taken verbatim from the synthetic corpus
(``app/src/data/corpus.ts``) so the offsets asserted here are the offsets the
grounding pipeline sees.
"""

import annotator

# ── corpus fragments (verbatim from app/src/data/corpus.ts) ───────────────────

REFERRAL = (
    "Dear Cardiology, I would be grateful for your assessment of Mrs Margaret "
    "Aldington, a 62-year-old with poorly controlled hypertension. She currently "
    "takes amlodipine 5mg once daily. Blood pressure in clinic today 168/98. "
    "No known drug allergies recorded at referral."
)
CLINIC = (
    "Thank you for referring Mrs Aldington. Impression: essential hypertension. "
    "I have increased her amlodipine to 10mg once daily and will review in three "
    "months. Of note, she reports a penicillin allergy (rash), which was not on "
    "the referral."
)
LAB = (
    "Urea and electrolytes, sample 10/03/2023. Sodium 139 mmol/L. "
    "Potassium 5.9 mmol/L (HIGH). Creatinine 78 umol/L. Query haemolysed "
    "sample; suggest repeat."
)
DISCHARGE = (
    "Discharge summary. Admitted with chest pain, ruled out for acute coronary "
    "syndrome. Discharge medications: amlodipine 10mg once daily; atorvastatin "
    "20mg once daily. Working diagnosis of stable angina to be confirmed by "
    "outpatient testing. Allergy: penicillin."
)
ANGIO = (
    "CT coronary angiography, 12/08/2023. Unobstructed coronary arteries. "
    "No evidence of obstructive coronary artery disease. The earlier working "
    "diagnosis of stable angina is not supported by these findings."
)
DRUGCHART = (
    "Drug chart: amlodipine 10mg OD given 03/06. Paracetamol 1g PRN. "
    "Handwriting partially legible; pharmacist review advised."
)


def _find(entities, label, text):
    return [e for e in entities if e.label == label and e.text == text]


def _one(entities, label, text):
    hits = _find(entities, label, text)
    assert len(hits) == 1, f"expected exactly one {label} {text!r}, got {hits}"
    return hits[0]


# ── offset invariant ──────────────────────────────────────────────────────────


def test_offsets_are_character_accurate():
    for doc in (REFERRAL, CLINIC, LAB, DISCHARGE, ANGIO, DRUGCHART):
        for e in annotator.annotate(doc):
            assert doc[e.start:e.end] == e.text
            assert 0 <= e.start < e.end <= len(doc)
            assert 0.0 <= e.score <= 1.0


def test_empty_text_returns_no_entities():
    assert annotator.annotate("") == []


# ── the queen's named example: 'amlodipine 10mg' ──────────────────────────────


def test_drug_and_dose_exact_spans():
    ents = annotator.annotate(DRUGCHART)
    drug = _one(ents, "DRUG", "amlodipine")
    assert DRUGCHART[drug.start:drug.end] == "amlodipine"
    dose = _one(ents, "DOSE", "10mg")
    # The dose immediately follows the drug in "amlodipine 10mg OD".
    assert DRUGCHART[dose.start:dose.end] == "10mg"
    assert dose.start == drug.end + 1
    _one(ents, "FREQUENCY", "OD")
    _one(ents, "DRUG", "Paracetamol")
    _one(ents, "DOSE", "1g")
    _one(ents, "FREQUENCY", "PRN")


def test_referral_medication_and_condition():
    ents = annotator.annotate(REFERRAL)
    _one(ents, "DISEASE", "hypertension")
    _one(ents, "DRUG", "amlodipine")
    _one(ents, "DOSE", "5mg")
    _one(ents, "FREQUENCY", "once daily")


# ── laboratory analytes and their values ──────────────────────────────────────


def test_lab_analytes_and_values():
    ents = annotator.annotate(LAB)
    _one(ents, "LAB", "Potassium")
    _one(ents, "LAB_VALUE", "5.9 mmol/L")
    _one(ents, "LAB", "Sodium")
    _one(ents, "LAB_VALUE", "139 mmol/L")
    _one(ents, "LAB", "Creatinine")
    _one(ents, "LAB_VALUE", "78 umol/L")
    # The panel name wins over its constituent words ("urea", "electrolytes").
    _one(ents, "LAB", "Urea and electrolytes")
    assert not _find(ents, "LAB", "urea")


def test_dates_are_not_read_as_vitals():
    # "10/03/2023" is a date, not a blood-pressure reading.
    assert not _find(annotator.annotate(LAB), "VITAL", "10/03")
    # "given 03/06" in the drug chart must not read as a vital either.
    assert _find(annotator.annotate(DRUGCHART), "VITAL", "03/06") == []


def test_blood_pressure_in_context_is_a_vital():
    _one(annotator.annotate(REFERRAL), "VITAL", "168/98")


# ── allergen vs drug disambiguation ───────────────────────────────────────────


def test_penicillin_is_an_allergen_in_allergy_context():
    _one(annotator.annotate(CLINIC), "ALLERGEN", "penicillin")
    _one(annotator.annotate(DISCHARGE), "ALLERGEN", "penicillin")


# ── assertion (negation / uncertainty) ────────────────────────────────────────


def test_negation_ruled_out_condition():
    ents = annotator.annotate(DISCHARGE)
    # "ruled out for acute coronary syndrome" -> negated ...
    acs = _one(ents, "DISEASE", "acute coronary syndrome")
    assert acs.assertion == "negated"
    # ... but "Admitted with chest pain" in the same sentence stays affirmed.
    chest_pain = _one(ents, "DISEASE", "chest pain")
    assert chest_pain.assertion == "affirmed"


def test_negation_after_the_entity():
    # "stable angina is not supported" -> negated (backward refutation).
    angina = _one(annotator.annotate(ANGIO), "DISEASE", "stable angina")
    assert angina.assertion == "negated"


def test_no_evidence_of_is_negated():
    cad = _one(annotator.annotate(ANGIO), "DISEASE", "coronary artery disease")
    assert cad.assertion == "negated"


def test_working_diagnosis_is_possible():
    # In the discharge summary the same phrase is a working (uncertain) diagnosis.
    angina = _one(annotator.annotate(DISCHARGE), "DISEASE", "stable angina")
    assert angina.assertion == "possible"


def test_affirmed_allergy_is_not_negated():
    # "not on the referral" is a later clause and must not negate the allergy.
    pen = _one(annotator.annotate(CLINIC), "ALLERGEN", "penicillin")
    assert pen.assertion == "affirmed"


# ── HTTP layer (skipped when FastAPI / httpx are absent) ───────────────────────

try:
    from fastapi.testclient import TestClient

    import app as ner_app

    _client = TestClient(ner_app.app)
    _HTTP = True
except Exception:  # pragma: no cover - depends on the install profile
    _HTTP = False


import pytest


@pytest.mark.skipif(not _HTTP, reason="fastapi/httpx not installed")
def test_health_endpoint():
    r = _client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


@pytest.mark.skipif(not _HTTP, reason="fastapi/httpx not installed")
def test_ner_endpoint_contract():
    r = _client.post("/ner", json={"text": DRUGCHART})
    assert r.status_code == 200
    body = r.json()
    assert "entities" in body
    for e in body["entities"]:
        # The five contract fields ner-client.ts reads must all be present.
        assert set(("text", "label", "start", "end", "score")).issubset(e)
        assert DRUGCHART[e["start"]:e["end"]] == e["text"]
    labels = {(e["label"], e["text"]) for e in body["entities"]}
    assert ("DRUG", "amlodipine") in labels
    assert ("DOSE", "10mg") in labels


@pytest.mark.skipif(not _HTTP, reason="fastapi/httpx not installed")
def test_ner_endpoint_empty_text():
    r = _client.post("/ner", json={"text": ""})
    assert r.status_code == 200
    assert r.json() == {"entities": []}
