// Pure helpers and metadata for the Documents tab. No React, no side effects —
// just formatting, mime/route classification, and building the optimistic row
// for an upload. Everything reads the frozen contract types.
import type { DocumentInfo, OcrStatus, ProcessingRoute } from '../../domain/types';
import { store } from '../../data/adapter';

/** File size: whole KB up to 1 MB, then MB with one decimal. */
export function formatSize(sizeKb: number): string {
  if (sizeKb < 1024) return `${Math.round(sizeKb)} KB`;
  return `${(sizeKb / 1024).toFixed(1)} MB`;
}

/** Confidence 0..1 as a whole percent. */
export function formatPct(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

export type DocType = 'pdf' | 'image' | 'other';

export function docType(mime: string): DocType {
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  return 'other';
}

/** A cloud route sent the page image out of the box; `local` kept it private. */
export function isCloudRoute(route: ProcessingRoute): boolean {
  return route !== 'local';
}

/** Human names for OCR states. Paired with a colour, never colour alone. */
export const OCR_LABEL: Record<OcrStatus, string> = {
  pending: 'Pending',
  processing: 'Processing',
  done: 'Done',
  review: 'Review',
  failed: 'Failed',
};

export const OCR_COLOUR: Record<OcrStatus, string> = {
  pending: 'var(--fg-2)',
  processing: 'var(--accent)',
  done: 'var(--green)',
  review: 'var(--amber)',
  failed: 'var(--rose)',
};

export const OCR_HELP: Record<OcrStatus, string> = {
  pending: 'Queued for OCR — not started yet.',
  processing: 'The OCR model is reading the pages now.',
  done: 'Read in full; the text is available to the agent.',
  review: 'Low-confidence fields are waiting for a person to confirm.',
  failed: 'OCR could not read this document.',
};

/** Display names for routes, cased the way each provider writes it. */
export const ROUTE_NAME: Record<ProcessingRoute, string> = {
  local: 'Local',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  mistral: 'Mistral',
  gemini: 'Gemini',
};

const ROUTES: ProcessingRoute[] = ['local', 'anthropic', 'openai', 'mistral', 'gemini'];

/** The route a new upload would take, read from the OCR config option. */
export function configuredOcrRoute(): ProcessingRoute {
  const opt = store.config().find((c) => c.key === 'ocr.route');
  const v = typeof opt?.value === 'string' ? opt.value : 'local';
  return ROUTES.includes(v as ProcessingRoute) ? (v as ProcessingRoute) : 'local';
}

/** Distinct projects seen across a set of documents, in first-seen order. */
export function projectsOf(docs: DocumentInfo[]): string[] {
  const seen: string[] = [];
  for (const d of docs) if (!seen.includes(d.project)) seen.push(d.project);
  return seen;
}

/** Guess a mime type from the filename when the browser gives none. */
function inferMime(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'tif' || ext === 'tiff') return 'image/tiff';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'application/octet-stream';
}

/** Build the optimistic 'pending' row for a dropped/picked file. Pages are a
 *  rough guess for PDFs and confirmed once OCR actually runs. */
export function buildQueuedDoc(args: {
  file: File;
  project: string;
  ownerId: string;
  route: ProcessingRoute;
  handwriting: boolean;
  now: number;
  index: number;
}): DocumentInfo {
  const { file, project, ownerId, route, handwriting, now } = args;
  const mime = file.type || inferMime(file.name);
  const sizeKb = Math.max(1, Math.round(file.size / 1024));
  const pages = docType(mime) === 'image' ? 1 : Math.max(1, Math.round(sizeKb / 90));
  return {
    // Collision-free id: `now` is a fixed value across an upload batch and
    // `index` restarts at 0 each batch, so a time-plus-index scheme minted
    // duplicate ids across separate uploads — duplicate React keys, and the
    // reconcile step overwriting the wrong row. A UUID is unique per row.
    id: `up-${crypto.randomUUID()}`,
    name: file.name,
    ownerId,
    project,
    sizeKb,
    pages,
    mime,
    uploadedAt: now,
    ocr: 'pending',
    ocrRoute: route,
    handwriting,
  };
}

/** The operator acting from this control plane: first admin, else first owner. */
export function actingOwnerId(): string {
  const owners = store.owners();
  return (owners.find((o) => o.role === 'admin') ?? owners[0]).id;
}
