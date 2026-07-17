// Direct tests for the real ReviewQueue: the empty state, the singular/plural
// field wording, the optional confidence readout, and the local "Open for
// review" toggle.
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReviewQueue } from './ReviewQueue';
import { store } from '../../data/adapter';
import type { DocumentInfo } from '../../domain/types';

const base = {
  ownerId: store.owners()[0].id, project: 'p', sizeKb: 10, pages: 1,
  mime: 'application/pdf', uploadedAt: store.now(), ocrRoute: 'local' as const, handwriting: true,
};

describe('ReviewQueue', () => {
  it('renders the empty state when nothing is waiting', () => {
    render(<ReviewQueue docs={[]} />);
    expect(screen.getByText('0 waiting')).toBeInTheDocument();
    expect(screen.getByText(/Nothing waiting/)).toBeInTheDocument();
  });

  it('lists review docs with singular/plural wording and optional confidence', () => {
    const docs: DocumentInfo[] = [
      { ...base, id: 'r1', name: 'r1.pdf', ocr: 'review', fieldsForReview: 1 },   // singular, no confidence
      { ...base, id: 'r2', name: 'r2.pdf', ocr: 'review', confidence: 0.6 },      // plural (0), confidence shown
      { ...base, id: 'x1', name: 'x1.pdf', ocr: 'done' },                         // excluded
    ];
    render(<ReviewQueue docs={docs} />);

    expect(screen.getByText('2 waiting')).toBeInTheDocument();
    expect(screen.getByText('r1.pdf')).toBeInTheDocument();
    expect(screen.queryByText('x1.pdf')).toBeNull();
    expect(screen.getByText('1 field to confirm')).toBeInTheDocument();  // singular
    expect(screen.getByText('0 fields to confirm')).toBeInTheDocument(); // plural
    expect(screen.getByText('lowest 60%')).toBeInTheDocument();

    // Opening one flips it to the opened state and reveals the note.
    fireEvent.click(screen.getAllByRole('button', { name: 'Open for review' })[0]);
    expect(screen.getByText('opened')).toBeInTheDocument();
    expect(screen.getByText(/Review panel would open here/)).toBeInTheDocument();
  });
});
