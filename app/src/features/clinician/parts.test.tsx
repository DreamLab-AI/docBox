// Component tests for the Clinician presentational atoms: the standing/specialist
// pills, the evidence reveal (including the no-evidence path an unevidenced
// sentence must show), and the contradiction callout (including the fallback when
// a reference cannot resolve).
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { StandingTag, SpecialistChip, ConfidenceText, DocRef, EvidenceReveal, ContradictionCallout } from './parts';
import type { EvidenceSpan } from '../../domain/types';
import { CORPUS_DOCUMENTS, CORPUS_CLAIMS, CORPUS_CONTRADICTIONS } from '../../data/corpus';

const docById = (id: string) => CORPUS_DOCUMENTS.find((d) => d.id === id);
const claimById = (id: string) => CORPUS_CLAIMS.find((c) => c.id === id);
const spanIn = (docId: string, quote: string): EvidenceSpan => {
  const doc = CORPUS_DOCUMENTS.find((d) => d.id === docId)!;
  const start = doc.text.indexOf(quote);
  return { docId, start, end: start + quote.length, quote };
};

describe('StandingTag', () => {
  it('labels each standing (never colour alone)', () => {
    const { rerender } = render(<StandingTag standing="active" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
    rerender(<StandingTag standing="superseded" />);
    expect(screen.getByText('Superseded')).toBeInTheDocument();
    rerender(<StandingTag standing="refuted" />);
    expect(screen.getByText('Refuted')).toBeInTheDocument();
  });
});

describe('SpecialistChip and ConfidenceText', () => {
  it('names a specialist', () => {
    render(<SpecialistChip id="medications" />);
    expect(screen.getByText('Medications')).toBeInTheDocument();
  });

  it('shows a percent and the method behind it', () => {
    render(<ConfidenceText confidence={{ score: 0.94, method: 'ocr+ner' }} />);
    expect(screen.getByText('94% · ocr+ner')).toBeInTheDocument();
  });
});

describe('DocRef', () => {
  it('names a document', () => {
    render(<DocRef doc={docById('src-clinic')} />);
    expect(screen.getByText('Cardiology clinic letter.pdf')).toBeInTheDocument();
  });

  it('degrades to "unknown source" when the document is missing', () => {
    render(<DocRef doc={undefined} />);
    expect(screen.getByText('unknown source')).toBeInTheDocument();
  });
});

describe('EvidenceReveal', () => {
  it('shows an unevidenced sentence plainly, with nothing to expand', () => {
    render(<EvidenceReveal id="x" evidence={[]} documentById={docById} />);
    expect(screen.getByText('no source · not asserted')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('expands to the exact quoted passage and its source, then hides again', () => {
    const evidence = [spanIn('src-clinic', 'amlodipine to 10mg once daily')];
    render(<EvidenceReveal id="s1" evidence={evidence} documentById={docById} />);

    const toggle = screen.getByRole('button', { name: 'Show source (1)' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/amlodipine to 10mg once daily/)).toBeInTheDocument();
    expect(screen.getByText('Cardiology clinic letter.pdf')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide source' }));
    expect(screen.queryByText(/amlodipine to 10mg once daily/)).toBeNull();
  });

  it('names an unknown source when the evidence points at a missing document', () => {
    const evidence: EvidenceSpan[] = [{ docId: 'src-ghost', start: 0, end: 3, quote: 'n/a' }];
    render(<EvidenceReveal id="ghost" evidence={evidence} documentById={docById} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show source (1)' }));
    expect(screen.getByText('unknown source')).toBeInTheDocument();
  });
});

describe('ContradictionCallout', () => {
  it('names both sources, both dates and both values', () => {
    render(
      <ContradictionCallout
        contradiction={CORPUS_CONTRADICTIONS[0]}
        claimById={claimById}
        documentById={docById}
      />,
    );
    const note = screen.getByRole('note', { name: 'Contradiction between sources' });
    expect(within(note).getByText('Discharge summary.pdf')).toBeInTheDocument();
    expect(within(note).getByText('GP repeat medication list.pdf')).toBeInTheDocument();
    expect(within(note).getByText(/the later GP repeat list still shows 5mg/)).toBeInTheDocument();
  });

  it('falls back cleanly when a referenced claim or document cannot resolve', () => {
    render(
      <ContradictionCallout
        contradiction={CORPUS_CONTRADICTIONS[0]}
        claimById={() => undefined}
        documentById={() => undefined}
      />,
    );
    const note = screen.getByRole('note', { name: 'Contradiction between sources' });
    expect(within(note).getAllByText('unknown source').length).toBe(2);
    expect(within(note).getAllByText('referenced claim not found').length).toBe(2);
  });
});
