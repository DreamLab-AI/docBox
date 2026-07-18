// Clinician — the query surface for the evidence-linked patient record (PRD-011,
// demo acts 4–5). Ask a question and get an answer whose every sentence shows the
// source it stands on; contradictions between documents are surfaced, not resolved
// for you; superseded and refuted values are kept and marked. Data comes only from
// useCorpus, which today reads the offline corpus and later repoints at the adapter.
import { useState, type FormEvent } from 'react';
import type { Claim, ReadingSession, SpecialistFinding } from '../../domain/types';
import { Panel, WhenToUse } from '../../ui/primitives';
import { useCorpus, type Corpus } from './useCorpus';
import { ConfidenceText, ContradictionCallout, DocRef, EvidenceReveal, SpecialistChip, StandingTag } from './parts';
import { CATEGORY_LABEL, claimLabel, contradictionFor, fmtValidity } from './format';
import './clinician.css';

export default function ClinicianPanel() {
  const corpus = useCorpus();
  const [draft, setDraft] = useState(corpus.demoQuestion);
  const [session, setSession] = useState<ReadingSession>(() => corpus.ask(corpus.demoQuestion));

  const ask = (question: string) => setSession(corpus.ask(question));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    ask(draft);
  };
  const useDemo = () => {
    setDraft(corpus.demoQuestion);
    ask(corpus.demoQuestion);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}>
      <WhenToUse>
        <strong>When to use Clinician.</strong> Ask a question of the patient's record and read an answer where every
        sentence shows the source it stands on. Where documents disagree — a discharge dose against a later GP repeat —
        the contradiction is surfaced for you to reconcile, never resolved silently. Superseded and refuted values are
        kept and marked, and the Specialists panel shows which readers were convened.
      </WhenToUse>

      <Panel title="Ask the record" hint={corpus.record.patientLabel}>
        <form onSubmit={submit} style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-3)' }}>
          <input
            className="clin-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Question for the record"
            placeholder="Ask a question of the record…"
            style={{ flex: '1 1 320px' }}
          />
          <button type="submit" className="btn btn-primary">Ask</button>
          <button type="button" className="btn" onClick={useDemo}>Use demo question</button>
        </form>
      </Panel>

      <AnswerPanel session={session} corpus={corpus} />
      <MdtPanel findings={session.findings} />
      <TimelinePanel claims={corpus.record.claims} corpus={corpus} />
    </div>
  );
}

/** The cited answer: each sentence with its expandable evidence, a contradiction
 *  callout where one is flagged, and the honest gaps beneath. */
function AnswerPanel({ session, corpus }: { session: ReadingSession; corpus: Corpus }) {
  const { answer } = session;
  return (
    <Panel title="Answer" hint="Every sentence carries the source it stands on">
      <p className="clin-question" aria-label="Question answered">“{session.question}”</p>
      <ol className="clin-answer">
        {answer.sentences.map((s, i) => {
          const contradiction = contradictionFor(corpus.record, s.contradictionId);
          return (
            <li key={i} className="clin-sentence">
              <p className="clin-sentence-text">{s.text}</p>
              <EvidenceReveal id={`s${i}`} evidence={s.evidence} documentById={corpus.documentById} />
              {contradiction && (
                <ContradictionCallout
                  contradiction={contradiction}
                  claimById={corpus.claimById}
                  documentById={corpus.documentById}
                />
              )}
            </li>
          );
        })}
      </ol>

      <div className="clin-gaps">
        <div className="clin-gaps-head">Honest gaps — what the record could not evidence</div>
        <ul className="clin-gaps-list">
          {answer.gaps.map((g, i) => <li key={i}>{g}</li>)}
        </ul>
      </div>
    </Panel>
  );
}

/** The MDT affordance: which Specialists the reading mesh convened, and what each read. */
function MdtPanel({ findings }: { findings: SpecialistFinding[] }) {
  return (
    <Panel title="Specialists convened" hint="The reading mesh — who read the record for this question">
      <ul className="clin-mdt">
        {findings.map((f) => (
          <li key={f.specialist} className="clin-mdt-row">
            <SpecialistChip id={f.specialist} />
            <div className="clin-mdt-body">
              <p className="clin-mdt-summary">{f.summary}</p>
              <span className="muted clin-mdt-count">
                {f.claimIds.length} {f.claimIds.length === 1 ? 'claim' : 'claims'}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** The compact record view: every Claim in time order, standing marked, so
 *  supersession and refutation are visible rather than hidden. */
function TimelinePanel({ claims, corpus }: { claims: Claim[]; corpus: Corpus }) {
  const ordered = [...claims].sort((a, b) => a.validity.from - b.validity.from);
  return (
    <Panel title="Record timeline" hint="Every claim and its standing — superseded and refuted values are kept, never hidden">
      <ol className="clin-timeline">
        {ordered.map((c) => (
          <li key={c.id} className={`clin-claim clin-claim-${c.standing}`}>
            <div className="clin-claim-main">
              <span className="clin-claim-cat">{CATEGORY_LABEL[c.category]}</span>
              <span className="clin-claim-label">{c.label}</span>
              <StandingTag standing={c.standing} />
            </div>
            <div className="clin-claim-meta">
              <span>{fmtValidity(c.validity)}</span>
              <ConfidenceText confidence={c.confidence} />
              <DocRef doc={corpus.documentById(c.evidence.docId)} />
              {c.supersedesClaimId && (
                <span className="clin-supersedes muted">
                  supersedes “{claimLabel(corpus.claimById(c.supersedesClaimId))}”
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
