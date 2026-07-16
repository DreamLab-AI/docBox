// The file-manager analogue: a filterable list of documents, newest first.
// Uploads (parent state) merge with store documents and sort by upload time, so
// a freshly queued file lands at the top. Filters are local state.
import { useMemo, useState } from 'react';
import type { DocumentInfo, OcrStatus } from '../../domain/types';
import { store } from '../../data/adapter';
import { Panel, OwnerTag, EmptyState, fmtAgo } from '../../ui/primitives';
import { TypeIcon, OcrChip, RouteMarker, HandwritingTag, ConfidenceTag } from './parts';
import { formatSize, isCloudRoute, projectsOf, OCR_LABEL } from './format';

type RouteFilter = 'all' | 'local' | 'cloud';
type StatusFilter = 'all' | OcrStatus;

const STATUS_ORDER: OcrStatus[] = ['pending', 'processing', 'done', 'review', 'failed'];

export function DocumentList({ docs }: { docs: DocumentInfo[] }) {
  const now = store.now();
  const owners = store.owners();
  const projects = useMemo(() => projectsOf(docs), [docs]);

  const [owner, setOwner] = useState('all');
  const [project, setProject] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [route, setRoute] = useState<RouteFilter>('all');
  const [text, setText] = useState('');

  const rows = useMemo(() => {
    const q = text.trim().toLowerCase();
    return docs
      .filter((d) => owner === 'all' || d.ownerId === owner)
      .filter((d) => project === 'all' || d.project === project)
      .filter((d) => status === 'all' || d.ocr === status)
      .filter((d) => route === 'all' || (route === 'cloud' ? isCloudRoute(d.ocrRoute) : !isCloudRoute(d.ocrRoute)))
      .filter((d) => q === '' || d.name.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => b.uploadedAt - a.uploadedAt);
  }, [docs, owner, project, status, route, text]);

  const active = owner !== 'all' || project !== 'all' || status !== 'all' || route !== 'all' || text !== '';

  return (
    <Panel
      title="Documents"
      hint={`${rows.length} of ${docs.length} shown, newest first`}
      right={active ? <button type="button" className="btn" style={{ padding: '2px 10px' }} onClick={() => { setOwner('all'); setProject('all'); setStatus('all'); setRoute('all'); setText(''); }}>Clear filters</button> : undefined}
    >
      {/* Filter bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--s-3)', marginBottom: 'var(--s-4)' }}>
        <input
          className="doc-input"
          type="search"
          placeholder="Filter by filename…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ minWidth: 200, flex: '1 1 200px' }}
          aria-label="Filter by filename"
        />
        <select className="doc-select" value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Filter by owner">
          <option value="all">All owners</option>
          {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <select className="doc-select" value={project} onChange={(e) => setProject(e.target.value)} aria-label="Filter by project">
          <option value="all">All projects</option>
          {projects.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Status chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)', marginBottom: 'var(--s-2)' }}>
        <button type="button" className="doc-chip" aria-pressed={status === 'all'} onClick={() => setStatus('all')}>All statuses</button>
        {STATUS_ORDER.map((s) => (
          <button key={s} type="button" className="doc-chip" aria-pressed={status === s} onClick={() => setStatus(s)}>
            {OCR_LABEL[s]}
          </button>
        ))}
      </div>

      {/* Route chips — the privacy filter */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)', marginBottom: 'var(--s-4)' }}>
        <button type="button" className="doc-chip" aria-pressed={route === 'all'} onClick={() => setRoute('all')}>Any route</button>
        <button type="button" className="doc-chip" aria-pressed={route === 'local'} onClick={() => setRoute('local')}>Local · private</button>
        <button type="button" className="doc-chip" aria-pressed={route === 'cloud'} onClick={() => setRoute('cloud')}>Cloud provider</button>
      </div>

      {rows.length === 0 ? (
        <EmptyState>No documents match these filters.</EmptyState>
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
          {rows.map((d) => <DocumentRow key={d.id} doc={d} now={now} />)}
        </ol>
      )}
    </Panel>
  );
}

function DocumentRow({ doc, now }: { doc: DocumentInfo; now: number }) {
  const review = doc.ocr === 'review';
  return (
    <li
      className="doc-row"
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--s-3)',
        padding: 'var(--s-3)', background: 'var(--bg-2)', borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--line)',
        borderLeft: `3px solid ${review ? 'var(--amber)' : 'transparent'}`,
      }}
    >
      <TypeIcon mime={doc.mime} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, wordBreak: 'break-all' }}>{doc.name}</span>
          {doc.handwriting && <HandwritingTag />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', flexWrap: 'wrap', marginTop: 3, fontSize: 'var(--fs-xs)', color: 'var(--fg-2)' }}>
          <OwnerTag ownerId={doc.ownerId} />
          <span className="mono">{doc.project}</span>
          <span>{formatSize(doc.sizeKb)}</span>
          <span>{doc.pages} {doc.pages === 1 ? 'page' : 'pages'}</span>
          <span>{fmtAgo(doc.uploadedAt, now)}</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {doc.ocr === 'done' && typeof doc.confidence === 'number' && <ConfidenceTag confidence={doc.confidence} />}
        {review && typeof doc.fieldsForReview === 'number' && (
          <span title="Low-confidence fields waiting for a person to confirm" style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--amber)' }}>
            {doc.fieldsForReview} to confirm
          </span>
        )}
        <OcrChip status={doc.ocr} />
        <RouteMarker route={doc.ocrRoute} />
      </div>
    </li>
  );
}
