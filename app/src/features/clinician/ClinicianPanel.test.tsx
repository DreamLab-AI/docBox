// Component tests for the Clinician panel: the worked flagship answer (each
// sentence with its expandable citation, the S2 discharge-vs-GP contradiction
// surfaced with both sources), the Specialists (MDT) panel, the record timeline
// where supersession and refutation are marked, the honest gaps, and switching to
// a record-derived answer for a non-medications question.
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ClinicianPanel from './ClinicianPanel';
import { DEMO_QUESTION } from '../../data/corpus';

const panel = (title: string) => screen.getByText(title, { selector: 'h3' }).closest('section') as HTMLElement;
const question = () => screen.getByLabelText('Question for the record') as HTMLInputElement;

describe('ClinicianPanel — worked answer', () => {
  it('pre-fills the demo question and renders the cited answer sentences', () => {
    render(<ClinicianPanel />);
    expect(question().value).toBe(DEMO_QUESTION);

    const answer = panel('Answer');
    expect(within(answer).getByText(/increased to 10mg once daily at the cardiology clinic/)).toBeInTheDocument();
    expect(within(answer).getByText(/the June 2023 discharge summary also records amlodipine 10mg/i)).toBeInTheDocument();
    expect(within(answer).getByText(/She also takes atorvastatin 20mg once daily/)).toBeInTheDocument();
  });

  it('expands a citation to reveal the exact quoted source passage', () => {
    render(<ClinicianPanel />);
    const sentence = screen
      .getByText(/increased to 10mg once daily at the cardiology clinic/)
      .closest('li') as HTMLElement;

    fireEvent.click(within(sentence).getByRole('button', { name: /Show source/ }));
    expect(within(sentence).getByText(/amlodipine to 10mg once daily/)).toBeInTheDocument();
    expect(within(sentence).getByText('Cardiology clinic letter.pdf')).toBeInTheDocument();
  });

  it('surfaces the S2 contradiction naming both sources and dates', () => {
    render(<ClinicianPanel />);
    const note = screen.getByRole('note', { name: 'Contradiction between sources' });
    expect(within(note).getByText('Discharge summary.pdf')).toBeInTheDocument();
    expect(within(note).getByText('GP repeat medication list.pdf')).toBeInTheDocument();
    expect(within(note).getByText(/Discharge summary lists amlodipine 10mg/)).toBeInTheDocument();
    // Both source dates are named (2023, timezone-stable assertion).
    expect(within(note).getAllByText(/2023/).length).toBeGreaterThanOrEqual(2);
  });

  it('lists an honest gap the record could not evidence', () => {
    render(<ClinicianPanel />);
    const answer = panel('Answer');
    expect(within(answer).getByText(/Honest gaps/)).toBeInTheDocument();
    expect(within(answer).getByText(/Adherence and any doses taken at home are not evidenced/)).toBeInTheDocument();
  });
});

describe('ClinicianPanel — specialists convened (MDT)', () => {
  it('names the Specialists that read the record for the demo question', () => {
    render(<ClinicianPanel />);
    const mdt = panel('Specialists convened');
    expect(within(mdt).getByText('Medications')).toBeInTheDocument();
    expect(within(mdt).getByText('Chronology')).toBeInTheDocument();
    expect(within(mdt).getAllByText('3 claims').length).toBe(2);
  });
});

describe('ClinicianPanel — record timeline', () => {
  it('marks superseded and refuted claims distinctly from active ones', () => {
    render(<ClinicianPanel />);
    const timeline = panel('Record timeline');

    expect(within(timeline).getAllByText('Active').length).toBeGreaterThanOrEqual(1);
    expect(within(timeline).getAllByText('Superseded').length).toBeGreaterThanOrEqual(2);
    expect(within(timeline).getByText('Refuted')).toBeInTheDocument();

    // Supersession is spelled out, not hidden.
    expect(within(timeline).getAllByText(/supersedes/).length).toBeGreaterThanOrEqual(2);
    // The superseded row carries its standing class, distinct from active rows.
    expect(timeline.querySelectorAll('.clin-claim-superseded').length).toBeGreaterThanOrEqual(2);
    expect(timeline.querySelectorAll('.clin-claim-active').length).toBeGreaterThanOrEqual(1);
  });
});

describe('ClinicianPanel — asking another question', () => {
  it('answers a non-medications question from the record, with no contradiction', () => {
    render(<ClinicianPanel />);
    fireEvent.change(question(), { target: { value: 'What conditions does she have?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    const answer = panel('Answer');
    expect(within(answer).getByText('Diagnosis: Essential hypertension.')).toBeInTheDocument();
    expect(within(answer).getByText(/“What conditions does she have\?”/)).toBeInTheDocument();
    // The derived answer flags no contradiction.
    expect(screen.queryByRole('note', { name: 'Contradiction between sources' })).toBeNull();

    // The derived fan-out convenes Correspondence for the single allergy claim.
    const mdt = panel('Specialists convened');
    expect(within(mdt).getByText('Correspondence')).toBeInTheDocument();
    expect(within(mdt).getByText('1 claim')).toBeInTheDocument();
  });

  it('restores the demo answer from the "Use demo question" button', () => {
    render(<ClinicianPanel />);
    fireEvent.change(question(), { target: { value: 'anything else' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(screen.queryByRole('note', { name: 'Contradiction between sources' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Use demo question' }));
    expect(question().value).toBe(DEMO_QUESTION);
    expect(screen.getByRole('note', { name: 'Contradiction between sources' })).toBeInTheDocument();
  });
});
