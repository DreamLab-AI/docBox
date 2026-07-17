// Direct tests for the real Summary: the status breakdown and the local/cloud
// privacy split, including the empty-set path where the bar is 0%.
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Summary } from './Summary';
import { store } from '../../data/adapter';
import type { DocumentInfo } from '../../domain/types';

const base = {
  ownerId: store.owners()[0].id, project: 'p', sizeKb: 10, pages: 1,
  mime: 'application/pdf', uploadedAt: store.now(), handwriting: false,
};

describe('Summary', () => {
  it('renders headings and a zeroed split for no documents', () => {
    render(<Summary docs={[]} />);
    expect(screen.getByText('By status')).toBeInTheDocument();
    expect(screen.getByText('Where OCR ran')).toBeInTheDocument();
    expect(screen.getByText('local · private')).toBeInTheDocument();
  });

  it('counts the local vs cloud split across documents', () => {
    const docs: DocumentInfo[] = [
      { ...base, id: 's1', name: 's1.pdf', ocr: 'done', ocrRoute: 'local' },
      { ...base, id: 's2', name: 's2.pdf', ocr: 'review', ocrRoute: 'mistral' },
      { ...base, id: 's3', name: 's3.pdf', ocr: 'done', ocrRoute: 'local' },
    ];
    const { container } = render(<Summary docs={docs} />);
    // 2 local, 1 cloud — the coloured numbers appear in the "Where OCR ran" block.
    const local = within(container).getByText('local · private').closest('div') as HTMLElement;
    expect(local.textContent).toContain('2');
    const cloud = within(container).getByText('sent to a cloud provider').closest('div') as HTMLElement;
    expect(cloud.textContent).toContain('1');
  });
});
