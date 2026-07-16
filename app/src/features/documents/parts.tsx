// Small visual pieces shared by the document list, review queue and summary.
// Everything here is presentational and reads only the frozen contract types.
import type { OcrStatus, ProcessingRoute } from '../../domain/types';
import {
  docType, isCloudRoute, formatPct,
  OCR_LABEL, OCR_COLOUR, OCR_HELP, ROUTE_NAME,
} from './format';

/** A file-type glyph tinted by kind: PDF (rose), image (teal), other (grey). */
export function TypeIcon({ mime, size = 30 }: { mime: string; size?: number }) {
  const t = docType(mime);
  const colour = t === 'pdf' ? 'var(--rose)' : t === 'image' ? 'var(--teal)' : 'var(--fg-2)';
  return (
    <span
      aria-hidden
      title={mime}
      style={{
        width: size, height: size, flex: 'none', borderRadius: 'var(--radius-sm)',
        display: 'grid', placeItems: 'center', color: colour,
        background: `color-mix(in srgb, ${colour} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${colour} 38%, transparent)`,
      }}
    >
      {t === 'image' ? <ImageGlyph /> : <PageGlyph />}
    </span>
  );
}

function PageGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 2.5h8l4 4V21a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z" />
      <path d="M14 2.5V7h4" />
    </svg>
  );
}

function ImageGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 17l4.5-4 3 2.5L15 11l5 5.5" />
    </svg>
  );
}

/** OCR status chip: a coloured pip plus the label, with an explanatory title. */
export function OcrChip({ status }: { status: OcrStatus }) {
  const colour = OCR_COLOUR[status];
  const pulse = status === 'processing';
  return (
    <span
      title={OCR_HELP[status]}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '2px 9px', borderRadius: 100,
        fontSize: 'var(--fs-xs)', fontWeight: 600, color: colour,
        border: `1px solid color-mix(in srgb, ${colour} 45%, transparent)`,
        background: `color-mix(in srgb, ${colour} 12%, transparent)`,
      }}
    >
      <span
        className={pulse ? 'doc-pulse' : undefined}
        aria-hidden
        style={{ width: 7, height: 7, borderRadius: '50%', background: colour, boxShadow: `0 0 6px ${colour}` }}
      />
      {OCR_LABEL[status]}
    </span>
  );
}

/** The privacy marker: a shield for local (kept in the box) or a cloud glyph
 *  naming the provider the page image was sent to. This is the product's story. */
export function RouteMarker({ route }: { route: ProcessingRoute }) {
  const cloud = isCloudRoute(route);
  const colour = cloud ? 'var(--amber)' : 'var(--teal)';
  const label = cloud ? ROUTE_NAME[route] : 'Local';
  const title = cloud
    ? `Page image sent to ${ROUTE_NAME[route]} for OCR — it left the box.`
    : 'OCR ran in the box — the page image never left.';
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '2px 9px', borderRadius: 100,
        fontSize: 'var(--fs-xs)', fontWeight: 600, color: colour,
        border: `1px solid color-mix(in srgb, ${colour} 45%, transparent)`,
        background: `color-mix(in srgb, ${colour} 12%, transparent)`,
      }}
    >
      {cloud ? <CloudGlyph /> : <ShieldGlyph />}
      {label}
      {!cloud && <span style={{ color: 'var(--fg-2)', fontWeight: 500 }}>· private</span>}
    </span>
  );
}

function ShieldGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2.5 5 5.5v6c0 4.2 2.9 7.5 7 9 4.1-1.5 7-4.8 7-9v-6L12 2.5Z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function CloudGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 18h10a4 4 0 0 0 .4-8A5.5 5.5 0 0 0 6.5 9 3.8 3.8 0 0 0 7 18Z" />
      <path d="M12 8.5v5" />
      <path d="M9.5 11 12 8.5 14.5 11" />
    </svg>
  );
}

/** Handwriting tag — only shown when the model detected handwritten content. */
export function HandwritingTag() {
  return (
    <span
      title="Detected handwritten content — harder to read, more likely to need review."
      className="badge"
      style={{ padding: '0 7px', color: 'var(--violet)', borderColor: 'color-mix(in srgb, var(--violet) 45%, transparent)', background: 'color-mix(in srgb, var(--violet) 12%, transparent)' }}
    >
      ✎ handwriting
    </span>
  );
}

/** Lowest-field confidence, shown when OCR is done. */
export function ConfidenceTag({ confidence }: { confidence: number }) {
  // Below 0.8 reads as shaky even when the doc finished cleanly.
  const shaky = confidence < 0.8;
  const colour = shaky ? 'var(--amber)' : 'var(--fg-1)';
  return (
    <span title="Lowest-field confidence from OCR" style={{ fontSize: 'var(--fs-xs)', fontFamily: 'var(--font-mono)', color: colour }}>
      {formatPct(confidence)} conf
    </span>
  );
}
