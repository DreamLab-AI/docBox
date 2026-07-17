// Direct tests for the real DocumentList with a crafted document set, to cover
// the list's owner/project/status/route filters and the presentational parts:
// the shaky (<80%) confidence tag, the non-pdf/non-image type icon, the
// handwriting tag, and the in-list "N to confirm" review marker.
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { DocumentList } from './DocumentList';
import { store } from '../../data/adapter';
import type { DocumentInfo } from '../../domain/types';

const owners = store.owners();
const base = {
  ownerId: owners[0].id, project: 'proj-x', sizeKb: 100, pages: 1,
  mime: 'application/pdf', uploadedAt: store.now(), ocrRoute: 'local' as const, handwriting: false,
};
const docs: DocumentInfo[] = [
  { ...base, id: 'd1', name: 'alpha.pdf', ocr: 'done', confidence: 0.5 },                                  // shaky conf tag
  { ...base, id: 'd2', name: 'beta.dat', mime: 'application/octet-stream', ocr: 'pending' },               // "other" type icon
  { ...base, id: 'd3', name: 'gamma.png', mime: 'image/png', ownerId: owners[1].id, project: 'proj-y', ocr: 'review', fieldsForReview: 2, confidence: 0.7, handwriting: true }, // review + handwriting
  { ...base, id: 'd4', name: 'delta.pdf', ocr: 'done', ocrRoute: 'mistral', confidence: 0.95 },            // cloud route
];

const list = () => screen.getByText('Documents', { selector: 'h3' }).closest('section') as HTMLElement;

describe('DocumentList — parts', () => {
  it('renders the shaky confidence tag, handwriting tag and in-list review marker', () => {
    render(<DocumentList docs={docs} />);
    expect(within(list()).getByText('50% conf')).toBeInTheDocument();   // < 80% → shaky (amber)
    expect(within(list()).getByText('✎ handwriting')).toBeInTheDocument();
    expect(within(list()).getByText('2 to confirm')).toBeInTheDocument();
    // The unknown mime still renders as a row.
    expect(within(list()).getByText('beta.dat')).toBeInTheDocument();
  });
});

describe('DocumentList — filters', () => {
  it('filters by owner and by project', () => {
    render(<DocumentList docs={docs} />);
    expect(within(list()).getByText('4 of 4 shown, newest first')).toBeInTheDocument();

    fireEvent.change(within(list()).getByLabelText('Filter by owner'), { target: { value: owners[1].id } });
    expect(within(list()).getByText('1 of 4 shown, newest first')).toBeInTheDocument();
    expect(within(list()).getByText('gamma.png')).toBeInTheDocument();

    fireEvent.click(within(list()).getByRole('button', { name: 'Clear filters' }));
    fireEvent.change(within(list()).getByLabelText('Filter by project'), { target: { value: 'proj-y' } });
    expect(within(list()).getByText('1 of 4 shown, newest first')).toBeInTheDocument();
  });

  it('filters by status and by local route', () => {
    render(<DocumentList docs={docs} />);

    fireEvent.click(within(list()).getByRole('button', { name: 'Done' }));
    expect(within(list()).getByText('2 of 4 shown, newest first')).toBeInTheDocument(); // d1, d4

    fireEvent.click(within(list()).getByRole('button', { name: 'All statuses' }));
    fireEvent.click(within(list()).getByRole('button', { name: 'Local · private' }));
    expect(within(list()).getByText('3 of 4 shown, newest first')).toBeInTheDocument(); // all but d4 (mistral)
  });

  it('shows the empty state when nothing matches', () => {
    render(<DocumentList docs={docs} />);
    fireEvent.change(within(list()).getByLabelText('Filter by filename'), { target: { value: 'zzz-nope' } });
    expect(within(list()).getByText('No documents match these filters.')).toBeInTheDocument();
  });
});
