// Small presentational pieces for the Clinician surface. Everything here reads
// only the frozen contract types and resolves references through lookups passed
// in, so the atoms stay pure and independently testable. The product's promise —
// a sentence stands on its source, or it does not stand at all — lives in
// EvidenceReveal and ContradictionCallout.
import { useState } from 'react';
import type {
  ClaimStanding,
  Confidence,
  Contradiction,
  EvidenceSpan,
  SourceDocument,
  Claim,
  SpecialistId,
} from '../../domain/types';
import {
  claimDoc,
  fmtConfidence,
  fmtDate,
  STANDING_COLOUR,
  STANDING_HELP,
  STANDING_LABEL,
  SPECIALIST_LABEL,
} from './format';

/** A Claim's standing as a labelled pill (never colour alone). */
export function StandingTag({ standing }: { standing: ClaimStanding }) {
  const colour = STANDING_COLOUR[standing];
  return (
    <span
      className="clin-standing"
      title={STANDING_HELP[standing]}
      style={{
        color: colour,
        borderColor: `color-mix(in srgb, ${colour} 45%, transparent)`,
        background: `color-mix(in srgb, ${colour} 12%, transparent)`,
      }}
    >
      {STANDING_LABEL[standing]}
    </span>
  );
}

/** A Specialist named as a pill — the "who read this" affordance. */
export function SpecialistChip({ id }: { id: SpecialistId }) {
  return (
    <span className="clin-chip" title={`The ${SPECIALIST_LABEL[id]} Specialist read the record for this question.`}>
      {SPECIALIST_LABEL[id]}
    </span>
  );
}

/** A confidence score with the method that produced it. */
export function ConfidenceText({ confidence }: { confidence: Confidence }) {
  return (
    <span className="mono clin-conf" title="Descriptive confidence — never a licence to hide a value.">
      {fmtConfidence(confidence)}
    </span>
  );
}

/** A source document named inline: filename, provenance and its own date. */
export function DocRef({ doc }: { doc: SourceDocument | undefined }) {
  if (!doc) return <span className="muted">unknown source</span>;
  return (
    <span className="clin-docref">
      <span style={{ fontWeight: 600 }}>{doc.name}</span>
      <span className="muted"> · {doc.provenance} · {fmtDate(doc.date)}</span>
    </span>
  );
}

/** The citation control for one sentence. With no evidence it says so plainly and
 *  offers nothing to expand — an unevidenced sentence must never read as evidenced.
 *  With evidence it expands to the exact quoted passage and its source. */
export function EvidenceReveal({
  id,
  evidence,
  documentById,
}: {
  id: string;
  evidence: EvidenceSpan[];
  documentById: (docId: string) => SourceDocument | undefined;
}) {
  const [open, setOpen] = useState(false);

  if (evidence.length === 0) {
    return (
      <span className="clin-noev" title="No citation — this statement is not asserted as evidenced.">
        no source · not asserted
      </span>
    );
  }

  const panelId = `clin-ev-${id}`;
  return (
    <div className="clin-ev">
      <button
        type="button"
        className="clin-ev-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Hide source' : `Show source (${evidence.length})`}
      </button>
      {open && (
        <ul id={panelId} className="clin-ev-list">
          {evidence.map((span, i) => (
            <li key={`${span.docId}-${span.start}-${i}`} className="clin-ev-item">
              <DocRef doc={documentById(span.docId)} />
              <blockquote className="clin-quote">“{span.quote}”</blockquote>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A detected conflict between two Claims, surfaced and named — both sources, both
 *  dates, both values. Never silently resolved (DDD-004). */
export function ContradictionCallout({
  contradiction,
  claimById,
  documentById,
}: {
  contradiction: Contradiction;
  claimById: (id: string) => Claim | undefined;
  documentById: (id: string) => SourceDocument | undefined;
}) {
  const sides = contradiction.claimIds.map((cid) => {
    const claim = claimById(cid);
    return { cid, claim, doc: claimDoc(claim, documentById) };
  });
  return (
    <div className="clin-contra" role="note" aria-label="Contradiction between sources">
      <div className="clin-contra-head">
        <WarnGlyph /> Contradiction — the sources disagree
      </div>
      <p className="clin-contra-note">{contradiction.note}</p>
      <ul className="clin-contra-sides">
        {sides.map(({ cid, claim, doc }) => (
          <li key={cid} className="clin-contra-side">
            <DocRef doc={doc} />
            <span className="clin-contra-val">{claim ? claim.label : 'referenced claim not found'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WarnGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}
