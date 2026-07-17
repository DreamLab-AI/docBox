import { describe, it, expect } from 'vitest';
import {
  formatSize, formatPct, docType, isCloudRoute, configuredOcrRoute, projectsOf,
  buildQueuedDoc, actingOwnerId, OCR_LABEL, OCR_COLOUR, OCR_HELP, ROUTE_NAME,
} from './format';
import { useWorld, owner, configOpt, doc } from '../../test/world';

describe('formatSize', () => {
  it('shows whole KB below the 1 MB threshold', () => {
    expect(formatSize(0)).toBe('0 KB');
    expect(formatSize(512.4)).toBe('512 KB'); // rounds
    expect(formatSize(1023)).toBe('1023 KB');
  });
  it('switches to one-decimal MB at exactly 1024 KB and above', () => {
    expect(formatSize(1024)).toBe('1.0 MB');
    expect(formatSize(1536)).toBe('1.5 MB');
    expect(formatSize(2048)).toBe('2.0 MB');
  });
});

describe('formatPct', () => {
  it('renders a 0..1 confidence as a whole percent', () => {
    expect(formatPct(0)).toBe('0%');
    expect(formatPct(1)).toBe('100%');
    expect(formatPct(0.5)).toBe('50%');
    expect(formatPct(0.856)).toBe('86%'); // rounds
  });
});

describe('docType', () => {
  it('classifies pdf, image/*, and everything else', () => {
    expect(docType('application/pdf')).toBe('pdf');
    expect(docType('image/png')).toBe('image');
    expect(docType('image/tiff')).toBe('image');
    expect(docType('text/plain')).toBe('other');
    expect(docType('application/octet-stream')).toBe('other');
  });
});

describe('isCloudRoute', () => {
  it('is false only for the local (private) route', () => {
    expect(isCloudRoute('local')).toBe(false);
    expect(isCloudRoute('anthropic')).toBe(true);
    expect(isCloudRoute('gemini')).toBe(true);
  });
});

describe('configuredOcrRoute', () => {
  it('reads a valid route from the ocr.route config option', () => {
    useWorld({ config: [configOpt({ key: 'ocr.route', value: 'anthropic' })] });
    expect(configuredOcrRoute()).toBe('anthropic');
  });
  it('defaults to local when the option is absent', () => {
    useWorld({ config: [] });
    expect(configuredOcrRoute()).toBe('local');
  });
  it('defaults to local when the value is not a string', () => {
    useWorld({ config: [configOpt({ key: 'ocr.route', value: true })] });
    expect(configuredOcrRoute()).toBe('local');
  });
  it('defaults to local when the value is an unknown route name', () => {
    useWorld({ config: [configOpt({ key: 'ocr.route', value: 'quantum' })] });
    expect(configuredOcrRoute()).toBe('local');
  });
});

describe('projectsOf', () => {
  it('lists distinct projects in first-seen order', () => {
    const docs = [
      doc({ id: '1', project: 'aurora' }),
      doc({ id: '2', project: 'borealis' }),
      doc({ id: '3', project: 'aurora' }),
    ];
    expect(projectsOf(docs)).toEqual(['aurora', 'borealis']);
  });
  it('returns nothing for no documents', () => {
    expect(projectsOf([])).toEqual([]);
  });
});

describe('buildQueuedDoc', () => {
  const base = { project: 'proj', ownerId: 'o1', route: 'local' as const, handwriting: false, now: 42, index: 3 };

  it('builds a pending row, inferring mime and one page for images', () => {
    const file = new File(['x'.repeat(50000)], 'scan.PNG', { type: '' }); // uppercase ext
    const row = buildQueuedDoc({ ...base, file });
    // Ids are minted from a UUID, not the (fixed) now + (per-batch) index, so
    // they can never collide across separate uploads.
    expect(row.id).toMatch(/^up-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(row.mime).toBe('image/png');
    expect(row.pages).toBe(1); // images are always a single page
    expect(row.sizeKb).toBe(Math.round(50000 / 1024));
    expect(row.ocr).toBe('pending');
    expect(row.ocrRoute).toBe('local');
    expect(row.handwriting).toBe(false);
    expect(row.name).toBe('scan.PNG');
    expect(row.uploadedAt).toBe(42);
    expect(row.ownerId).toBe('o1');
    expect(row.project).toBe('proj');
  });

  it('estimates page count from size for PDFs', () => {
    const file = new File(['x'.repeat(900000)], 'report.pdf', { type: '' });
    const row = buildQueuedDoc({ ...base, file });
    expect(row.mime).toBe('application/pdf');
    expect(row.pages).toBe(Math.max(1, Math.round(900000 / 1024 / 90)));
    expect(row.pages).toBeGreaterThan(1);
  });

  it('prefers the browser-supplied mime over the inferred one', () => {
    const file = new File(['x'.repeat(100)], 'weird.pdf', { type: 'image/jpeg' });
    const row = buildQueuedDoc({ ...base, file });
    expect(row.mime).toBe('image/jpeg'); // type wins over the .pdf extension
    expect(row.pages).toBe(1);           // and it is treated as an image
  });

  it('clamps a near-empty file to at least 1 KB and 1 page', () => {
    const file = new File([''], 'empty.pdf', { type: '' });
    const row = buildQueuedDoc({ ...base, file });
    expect(row.sizeKb).toBe(1);
    expect(row.pages).toBe(1);
  });

  it('infers a mime from every recognised extension, else octet-stream', () => {
    const mimeFor = (name: string) =>
      buildQueuedDoc({ ...base, file: new File(['x'], name, { type: '' }) }).mime;
    expect(mimeFor('a.pdf')).toBe('application/pdf');
    expect(mimeFor('a.png')).toBe('image/png');
    expect(mimeFor('a.jpg')).toBe('image/jpeg');
    expect(mimeFor('a.jpeg')).toBe('image/jpeg');
    expect(mimeFor('a.tif')).toBe('image/tiff');
    expect(mimeFor('a.tiff')).toBe('image/tiff');
    expect(mimeFor('a.webp')).toBe('image/webp');
    expect(mimeFor('a.gif')).toBe('image/gif');
    expect(mimeFor('a.xyz')).toBe('application/octet-stream');
    expect(mimeFor('noextension')).toBe('application/octet-stream');
  });

  it('carries the chosen route and handwriting flag', () => {
    const file = new File(['x'.repeat(200)], 'note.jpg', { type: '' });
    const row = buildQueuedDoc({ ...base, file, route: 'mistral', handwriting: true });
    expect(row.ocrRoute).toBe('mistral');
    expect(row.handwriting).toBe(true);
  });

  it('mints a unique id even for identical args across upload batches', () => {
    // Same fixed `now` and same `index` (both batches start at 0) — the old
    // scheme collided here; UUID ids stay distinct.
    const file = () => new File(['x'.repeat(200)], 'same.pdf', { type: '' });
    const a = buildQueuedDoc({ ...base, file: file(), now: 42, index: 0 });
    const b = buildQueuedDoc({ ...base, file: file(), now: 42, index: 0 });
    expect(a.id).not.toBe(b.id);
  });
});

describe('actingOwnerId', () => {
  it('prefers the first admin', () => {
    useWorld({ owners: [owner({ id: 'u', role: 'user' }), owner({ id: 'admin', role: 'admin' })] });
    expect(actingOwnerId()).toBe('admin');
  });
  it('falls back to the first owner when there is no admin', () => {
    useWorld({ owners: [owner({ id: 'first', role: 'user' }), owner({ id: 'second', role: 'user' })] });
    expect(actingOwnerId()).toBe('first');
  });
});

describe('OCR/route lookup tables', () => {
  it('labels, colours, and explains every OCR state', () => {
    for (const s of ['pending', 'processing', 'done', 'review', 'failed'] as const) {
      expect(OCR_LABEL[s]).toBeTruthy();
      expect(OCR_COLOUR[s]).toMatch(/^var\(--/);
      expect(OCR_HELP[s]).toBeTruthy();
    }
  });
  it('names every processing route', () => {
    expect(ROUTE_NAME.local).toBe('Local');
    expect(ROUTE_NAME.anthropic).toBe('Anthropic');
    expect(ROUTE_NAME.openai).toBe('OpenAI');
    expect(ROUTE_NAME.mistral).toBe('Mistral');
    expect(ROUTE_NAME.gemini).toBe('Gemini');
  });
});
