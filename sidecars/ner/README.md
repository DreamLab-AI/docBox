# docBox NER sidecar

Clinical named-entity recognition and assertion for the grounding pipeline
([ADR-012](../../docs/reference/adr/ADR-012-clinical-grounding-stack.md),
[PRD-010](../../docs/reference/prd/PRD-010-clinical-grounding-pipeline.md)). A
small FastAPI service the TypeScript control plane reaches over HTTP, in the
[ADR-009](../../docs/reference/adr/ADR-009-slim-core-surfaces-as-modules.md)
module shape (a compose service, a config gate, a reach to the core over its API).

## Contract

```
GET  /health   -> {"status": "ok"}
GET  /         -> {"service": "docbox-ner", "mode": "rules|models", "labels": [...]}
POST /ner      -> {"entities": [{text, label, start, end, score, assertion}, ...]}
```

`POST /ner` takes `{"text": "..."}` and returns entities with character-accurate
offsets. This matches `server/src/corpus/ner-client.ts`:
`{text} -> {entities:[{text,label,start,end,score}]}`. Each entity also carries an
`assertion` field (`affirmed` | `negated` | `possible`) the grounding layer may
read to drop a negated finding — so "ruled out for acute coronary syndrome" does
not become an ACS Claim. The five contract fields are always present; `assertion`
is an additional field a consumer can ignore.

`quote == text[start:end]` holds for every entity by construction, which is the
same citation invariant the corpus enforces (DDD-004).

### Labels

Both modes emit the same normalised vocabulary:

`DRUG`, `DOSE`, `FREQUENCY`, `DISEASE`, `LAB`, `LAB_VALUE`, `ALLERGEN`,
`ANATOMY`, `VITAL` (the `models` path may additionally emit `CHEMICAL` and
`ONCOLOGY` from those OpenMed families).

## Two modes, one switch

The `NER_MODE` environment variable selects the backend.

### `rules` — the offline default

`NER_MODE=rules` (the default) runs the deterministic annotator in
`annotator.py`: a dictionary and regular-expression clinical annotator with a
NegEx / ConText-style assertion layer. It needs **no model download** and no ML
dependency, so the demonstrator and CI have a working `/ner` endpoint the moment
the container starts. It recognises the entity families the synthetic corpus
carries — drugs (amlodipine, atorvastatin, paracetamol), doses (`5mg`, `10mg`,
`1g`), administration frequencies (`once daily`, `OD`, `PRN`), conditions
(hypertension, stable angina, acute coronary syndrome), laboratory analytes and
values (potassium `5.9 mmol/L`), allergens (penicillin, in an allergy context)
and anatomy — and marks negation and uncertainty. It is a real annotator, not a
sample: the offset invariant and the assertion rules are tested in `test_app.py`.

Run it locally:

```bash
cd sidecars/ner
pip install -r requirements.txt
NER_MODE=rules uvicorn app:app --host 0.0.0.0 --port 8000
curl -s localhost:8000/ner -H 'content-type: application/json' \
  -d '{"text":"amlodipine 10mg once daily; ruled out acute coronary syndrome"}'
```

### `models` — OpenMed pinned checkpoints (ADR-012)

`NER_MODE=models` runs the OpenMed SuperClinical checkpoints through the Hugging
Face transformers token-classification pipeline (`aggregation_strategy="simple"`)
and layers medspaCy for assertion and section context, per ADR-012. The model set
is:

| Family | Normalised label | ADR-012 role |
|---|---|---|
| DiseaseDetect (184M) | `DISEASE` | diseases (BC5CDR / NCBI lineage) |
| PharmaDetect | `DRUG` | medications |
| ChemicalDetect | `CHEMICAL` | chemicals |
| AnatomyDetect | `ANATOMY` | anatomical structures |
| OncologyDetect (434M) | `ONCOLOGY` | oncology-specific entities |

Weights are **not** baked into the image and **not** committed to this repo. They
mount at runtime from a volume, and the exact pins live beside them on the box.
The backend reads the model set from a JSON file at `NER_MODEL_CONFIG` (default
`/models/models.json`); `models.example.json` in this directory documents the
shape. Each entry needs a pinned `revision` — the backend refuses to start while
any `revision` is null, so an unpinned checkpoint can never change extraction
behaviour silently (ADR-012 pins by revision as the bus-factor mitigation).

Model-download step on the DGX Spark (aarch64), run once on the appliance:

```bash
# 1. install the models group (see requirements.txt; torch from NVIDIA's aarch64
#    CUDA index on the appliance)
pip install -r requirements.txt transformers torch medspacy

# 2. copy the example, then download each pinned checkpoint into the weights
#    volume, recording the resolved commit SHA as the 'revision'
cp models.example.json /models/models.json
python - <<'PY'
from huggingface_hub import snapshot_download
for repo in [
    "OpenMed/OpenMed-NER-DiseaseDetect-SuperClinical-184M",
    "OpenMed/OpenMed-NER-PharmaDetect-SuperClinical-434M",
    "OpenMed/OpenMed-NER-ChemicalDetect-SuperClinical-434M",
    "OpenMed/OpenMed-NER-AnatomyDetect-SuperClinical-434M",
    "OpenMed/OpenMed-NER-OncologyDetect-SuperClinical-434M",
]:
    path = snapshot_download(repo)   # prints the local cache path; note its commit SHA
    print(repo, "->", path)
PY

# 3. edit /models/models.json: set each 'revision' to that checkpoint's commit SHA
# 4. serve
NER_MODE=models NER_MODEL_CONFIG=/models/models.json uvicorn app:app --host 0.0.0.0 --port 8000
```

Confirm each repository id against the OpenMed organisation on Hugging Face at
download time — a repo-id correction is an edit to `models.json`, not a code
change, because the backend reads the set from that file.

## Licences

Everything committed here is permissive:

- The sidecar code (this directory) — same licence as the repository (MIT).
- The `models` path pulls **OpenMed** checkpoints, which are **Apache-2.0**, over
  permissive base models (DeBERTa-v3 MIT, PubMedBERT / BiomedBERT MIT, BioELECTRA
  Apache-2.0), and **medspaCy** (Apache-2.0). GLiNER-biomed (Apache-2.0) is the
  ADR-012 zero-shot fallback for types the pinned checkpoints do not cover.
- OpenMed's domain-adaptive pretraining touched MIMIC-III, which sits under a
  PhysioNet data-use agreement. That constrains redistribution of the *training
  data*, not the released Apache-2.0 *weights* — recorded so the licence story is
  complete. The weights stay on the box regardless.

No restrictively-licensed component is committed to this repository. On `doctorBox` a
site may reach for a restricted stack (e.g. John Snow Labs) on merit under the
brief's relaxed rule, with that key and those weights held on the demo box; that
is a deployment choice, kept out of this repo.

## Target platform (aarch64)

The runtime image is built for **ARM64 (aarch64)**, the DGX Spark architecture
([ADR-015](../../docs/reference/adr/ADR-015-target-platform-dgx-spark.md)). The
base image is pinned by its multi-architecture index digest, so the same
reference resolves to the aarch64 layer on the appliance and to amd64 on the
degraded commodity path. The `rules` path is pure Python and architecture-neutral.
The `models` path relies on aarch64 wheels: `transformers`, `medspacy` and
`onnxruntime` publish manylinux/aarch64 wheels, and `torch` comes from NVIDIA's
aarch64 CUDA index on the appliance. On the DGX Spark's 128 GB unified memory the
BERT-class checkpoints (184M ≈ 370 MB, 434M ≈ 870 MB fp16) co-reside with gpt-oss
and the OCR model without a memory-budget trade-off.

Images are built on a host or the appliance, never in CI — this repository does
not build images in CI (Docker-in-Docker with bind mounts is broken in the dev
environment). CI typechecks and tests on x86; the aarch64 image is the host
artefact.

## Files

| File | Purpose |
|---|---|
| `app.py` | FastAPI wiring: `/health`, `/`, `/ner`, and the `NER_MODE` switch |
| `annotator.py` | the offline `rules` annotator (no third-party dependency) |
| `models_backend.py` | the `models` backend: OpenMed checkpoints + medspaCy |
| `models.example.json` | the model set to copy to the weights volume and pin |
| `requirements.txt` | pinned web core; models group commented for a light build |
| `test_app.py` | pytest for the rules path and the HTTP contract |
