// Unit tests for the real UploadPanel: the drag-and-drop zone, the file picker,
// the project / handwriting controls, the local vs cloud route messaging, and
// the POST-then-reconcile flow (ok-with-id, non-ok, and the empty-selection
// guard). Rendered directly so the OCR route and callbacks are controllable.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { UploadPanel } from './UploadPanel';
import { store } from '../../data/adapter';
import type { ConfigOption } from '../../domain/types';

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function renderPanel(projects = ['project-aurora', 'project-borealis']) {
  const onUploaded = vi.fn();
  const onReconcile = vi.fn();
  const utils = render(<UploadPanel projects={projects} onUploaded={onUploaded} onReconcile={onReconcile} />);
  const zone = utils.container.querySelector('.doc-drop') as HTMLElement;
  const input = utils.container.querySelector('input[type="file"]') as HTMLInputElement;
  return { ...utils, onUploaded, onReconcile, zone, input };
}

function pickFiles(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  fireEvent.change(input);
}

const okFetch = (body: Record<string, unknown> = {}) =>
  vi.fn().mockResolvedValue({ ok: true, json: async () => body });

describe('UploadPanel — drag and drop', () => {
  it('highlights on drag-over and drops files into the queue', async () => {
    global.fetch = okFetch() as unknown as typeof fetch;
    const { zone, onUploaded } = renderPanel();

    fireEvent.dragEnter(zone);
    expect(zone.className).toContain('is-over');
    fireEvent.dragOver(zone);
    expect(zone.className).toContain('is-over');
    fireEvent.dragLeave(zone);
    expect(zone.className).not.toContain('is-over');

    fireEvent.drop(zone, { dataTransfer: { files: [new File(['x'], 'dropped.pdf', { type: 'application/pdf' })] } });
    expect(zone.className).not.toContain('is-over');
    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(onUploaded.mock.calls[0][0]).toHaveLength(1);
    expect(screen.getByText(/queued for OCR/)).toBeInTheDocument();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });

  it('ignores an empty drop', () => {
    const { zone, onUploaded } = renderPanel();
    fireEvent.drop(zone, { dataTransfer: { files: [] } });
    expect(onUploaded).not.toHaveBeenCalled();
    expect(screen.queryByText(/queued for OCR/)).toBeNull();
  });
});

describe('UploadPanel — controls and routing', () => {
  it('carries the chosen project and handwriting flag onto the queued docs', async () => {
    global.fetch = okFetch() as unknown as typeof fetch;
    const { input, onUploaded } = renderPanel();

    fireEvent.click(screen.getByRole('checkbox'));                                  // handwriting on
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'project-borealis' } }); // project

    pickFiles(input, [new File(['a'], 'one.pdf', { type: 'application/pdf' }), new File(['b'], 'two.pdf', { type: 'application/pdf' })]);

    const built = onUploaded.mock.calls[0][0];
    expect(built).toHaveLength(2);
    expect(built[0]).toMatchObject({ project: 'project-borealis', handwriting: true });
    // Plural toast for more than one document.
    expect(screen.getByText(/2 documents queued for OCR/)).toBeInTheDocument();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });

  it('shows the cloud-route messaging when OCR is configured to a provider', async () => {
    // Point the OCR route at a cloud provider via the config the panel reads.
    const cfg = store.config().map((c) =>
      c.key === 'ocr.route' ? ({ ...c, value: 'mistral' } as ConfigOption) : c,
    );
    vi.spyOn(store, 'config').mockReturnValue(cfg);
    global.fetch = okFetch() as unknown as typeof fetch;

    const { input } = renderPanel();
    expect(screen.getAllByText('Mistral').length).toBeGreaterThanOrEqual(1); // route marker + footer
    expect(screen.getByText(/pages leave the box/)).toBeInTheDocument();

    pickFiles(input, [new File(['x'], 'cloudy.pdf', { type: 'application/pdf' })]);
    expect(screen.getByText(/queued for OCR via Mistral \(cloud\)/)).toBeInTheDocument();
  });
});

describe('UploadPanel — POST reconcile', () => {
  it('reconciles the row when the server returns an id', async () => {
    global.fetch = okFetch({ id: 'srv-9' }) as unknown as typeof fetch;
    const { input, onReconcile } = renderPanel();
    pickFiles(input, [new File(['x'], 'enrich.pdf', { type: 'application/pdf' })]);
    await waitFor(() => expect(onReconcile).toHaveBeenCalledTimes(1));
    expect(onReconcile.mock.calls[0][1]).toMatchObject({ id: 'srv-9', name: 'enrich.pdf' });
  });

  it('does not reconcile when the POST response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as unknown as typeof fetch;
    const { input, onReconcile } = renderPanel();
    pickFiles(input, [new File(['x'], 'rejected.pdf', { type: 'application/pdf' })]);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(onReconcile).not.toHaveBeenCalled();
  });
});
