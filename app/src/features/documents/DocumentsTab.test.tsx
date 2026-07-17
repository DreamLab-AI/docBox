// Component tests for the Documents tab: the document list with per-doc route
// markers (local vs cloud) and OCR status chips, the review queue, the upload
// panel (file select → optimistic queued row + POST to /api/documents, both the
// success and the fetch-fails paths), and the filename/route/status filters.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import DocumentsTab from './DocumentsTab';
import { store } from '../../data/adapter';

const docs = store.documents();
const panel = (title: string) => screen.getByText(title, { selector: 'h3' }).closest('section') as HTMLElement;

// Select a file into the hidden <input type=file> the way the browser would.
function selectFile(container: HTMLElement, file: File) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
  return input;
}

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('DocumentsTab — document list', () => {
  it('renders every stored document with route markers and OCR chips', () => {
    render(<DocumentsTab />);
    const list = panel('Documents');

    for (const d of docs) {
      expect(within(list).getByText(d.name)).toBeInTheDocument();
    }
    // Route markers: local docs read "Local", the one cloud doc names its provider.
    expect(within(list).getAllByText('Local').length).toBeGreaterThanOrEqual(1);
    expect(within(list).getByText('Mistral')).toBeInTheDocument(); // doc-4 → mistral (cloud)

    // OCR status chips are present across the fixture's states.
    expect(within(list).getAllByText('Review').length).toBeGreaterThanOrEqual(1);   // filter chip + doc-1
    expect(within(list).getAllByText('Done').length).toBeGreaterThanOrEqual(2);     // doc-2, doc-4 (+ chip)
    expect(within(list).getAllByText('Processing').length).toBeGreaterThanOrEqual(1); // doc-3 (+ chip)
    expect(within(list).getAllByText('Pending').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the privacy summary of where OCR ran', () => {
    render(<DocumentsTab />);
    const summary = panel('Summary');
    expect(within(summary).getByText('By status')).toBeInTheDocument();
    expect(within(summary).getByText('Where OCR ran')).toBeInTheDocument();
    expect(within(summary).getByText('sent to a cloud provider')).toBeInTheDocument();
  });
});

describe('DocumentsTab — review queue', () => {
  it('lists the review doc and opening it reveals the inline note', () => {
    render(<DocumentsTab />);
    const review = panel('Review queue');

    expect(within(review).getByText('1 waiting')).toBeInTheDocument();
    expect(within(review).getByText('intake-form-scanned.pdf')).toBeInTheDocument();

    const openBtn = within(review).getByRole('button', { name: 'Open for review' });
    fireEvent.click(openBtn);

    expect(within(review).queryByRole('button', { name: 'Open for review' })).toBeNull();
    expect(within(review).getByText('opened')).toBeInTheDocument();
    expect(within(review).getByText(/Review panel would open here/)).toBeInTheDocument();
  });
});

describe('DocumentsTab — filters', () => {
  it('narrows the list by filename', () => {
    render(<DocumentsTab />);
    const list = panel('Documents');
    expect(within(list).getByText(`${docs.length} of ${docs.length} shown, newest first`)).toBeInTheDocument();

    fireEvent.change(within(list).getByLabelText('Filter by filename'), { target: { value: 'invoice' } });
    expect(within(list).getByText(`1 of ${docs.length} shown, newest first`)).toBeInTheDocument();
    expect(within(list).getByText('invoice-Q2.pdf')).toBeInTheDocument();
    expect(within(list).queryByText('signed-contract.pdf')).toBeNull();
  });

  it('narrows by cloud route and clears back to the full list', () => {
    render(<DocumentsTab />);
    const list = panel('Documents');

    fireEvent.click(within(list).getByRole('button', { name: 'Cloud provider' }));
    expect(within(list).getByText(`1 of ${docs.length} shown, newest first`)).toBeInTheDocument();
    expect(within(list).getByText('invoice-Q2.pdf')).toBeInTheDocument();

    fireEvent.click(within(list).getByRole('button', { name: 'Clear filters' }));
    expect(within(list).getByText(`${docs.length} of ${docs.length} shown, newest first`)).toBeInTheDocument();
  });

  it('narrows by OCR status chip', () => {
    render(<DocumentsTab />);
    const list = panel('Documents');
    fireEvent.click(within(list).getByRole('button', { name: 'Review' }));
    expect(within(list).getByText(`1 of ${docs.length} shown, newest first`)).toBeInTheDocument();
    expect(within(list).getByText('intake-form-scanned.pdf')).toBeInTheDocument();
  });
});

describe('DocumentsTab — upload', () => {
  it('shows an optimistic queued row and POSTs to /api/documents (success path)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'srv-1' }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { container } = render(<DocumentsTab />);
    selectFile(container, new File(['scan'], 'my-upload.pdf', { type: 'application/pdf' }));

    // Toast confirms the queue-for-OCR and the route it took.
    expect(screen.getByText(/queued for OCR via Local \(in the box\)/)).toBeInTheDocument();

    // The metadata POST fires to the documents endpoint. Wait for it so the
    // server-enrich reconcile settles (it re-keys the row) before asserting.
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/documents', expect.objectContaining({ method: 'POST' })),
    );

    // Optimistic row is in the list (re-query live; the reconcile swapped its key).
    const list = panel('Documents');
    await waitFor(() => expect(within(list).getByText('my-upload.pdf')).toBeInTheDocument());
    expect(within(list).getByText(`${docs.length + 1} of ${docs.length + 1} shown, newest first`)).toBeInTheDocument();
  });

  it('keeps the optimistic row when the POST fails (offline mock backend)', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { container } = render(<DocumentsTab />);
    selectFile(container, new File(['scan'], 'offline-doc.pdf', { type: 'application/pdf' }));

    const list = panel('Documents');
    expect(await within(list).findByText('offline-doc.pdf')).toBeInTheDocument();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    // The rejected POST is swallowed; the queued row survives.
    expect(within(list).getByText('offline-doc.pdf')).toBeInTheDocument();
    expect(within(list).getByText(`${docs.length + 1} of ${docs.length + 1} shown, newest first`)).toBeInTheDocument();
  });

  it('queues and reconciles multiple files independently', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'srv-A' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'srv-B' }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { container } = render(<DocumentsTab />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [
        new File(['a'], 'multi-a.pdf', { type: 'application/pdf' }),
        new File(['b'], 'multi-b.pdf', { type: 'application/pdf' }),
      ],
      configurable: true,
    });
    fireEvent.change(input);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const list = panel('Documents');
    await waitFor(() => expect(within(list).getByText('multi-a.pdf')).toBeInTheDocument());
    expect(within(list).getByText('multi-b.pdf')).toBeInTheDocument();
    expect(within(list).getByText(`${docs.length + 2} of ${docs.length + 2} shown, newest first`)).toBeInTheDocument();
  });

  it('dismisses the upload toast', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
    const { container } = render(<DocumentsTab />);
    selectFile(container, new File(['scan'], 'dismiss-me.pdf', { type: 'application/pdf' }));

    const toast = screen.getByText(/queued for OCR/).closest('[role="status"]') as HTMLElement;
    fireEvent.click(within(toast).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/queued for OCR/)).toBeNull();
  });
});
