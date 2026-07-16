// Upload control: a drag-and-drop zone plus a file picker. On drop/select we
// build an optimistic 'pending' row and show it straight away, then POST the
// metadata to /api/documents. If that fetch fails (offline mock mode) the row
// stays put, so the queued-for-OCR UX is always visible. The store is never
// mutated — new rows live in the parent's React state.
import { useRef, useState } from 'react';
import type { DocumentInfo } from '../../domain/types';
import { store } from '../../data/adapter';
import { Panel } from '../../ui/primitives';
import { RouteMarker } from './parts';
import { buildQueuedDoc, configuredOcrRoute, ROUTE_NAME, isCloudRoute, actingOwnerId } from './format';

const API = import.meta.env.VITE_API_BASE ?? '';

export function UploadPanel({
  projects,
  onUploaded,
  onReconcile,
}: {
  projects: string[];
  onUploaded: (docs: DocumentInfo[]) => void;
  onReconcile: (id: string, doc: DocumentInfo) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [project, setProject] = useState(projects[0] ?? 'project-aurora');
  const [handwriting, setHandwriting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const route = configuredOcrRoute();
  const cloud = isCloudRoute(route);

  async function handleFiles(files: FileList | null) {
    const list = files ? Array.from(files) : [];
    if (list.length === 0) return;

    const now = store.now();
    const ownerId = actingOwnerId();
    const built = list.map((file, index) =>
      buildQueuedDoc({ file, project, ownerId, route, handwriting, now, index }),
    );

    onUploaded(built); // optimistic — visible immediately
    setToast(`${built.length} document${built.length > 1 ? 's' : ''} queued for OCR via ${ROUTE_NAME[route]}${cloud ? ' (cloud)' : ' (in the box)'}.`);

    // Fire the POSTs; reconcile any that the server enriches. Offline is fine —
    // the optimistic row remains and the demo still reads correctly.
    for (const doc of built) {
      try {
        const res = await fetch(`${API}/api/documents`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: doc.name,
            sizeKb: doc.sizeKb,
            pages: doc.pages,
            mime: doc.mime,
            handwriting: doc.handwriting,
          }),
        });
        if (!res.ok) continue;
        const saved = (await res.json()) as Partial<DocumentInfo>;
        if (saved && typeof saved.id === 'string') {
          onReconcile(doc.id, { ...doc, ...saved });
        }
      } catch {
        /* offline mock backend — keep the optimistic row */
      }
    }
  }

  return (
    <Panel
      title="Upload documents"
      hint="Scans and forms for the agent to read"
      right={<RouteMarker route={route} />}
    >
      <div
        className={`doc-drop${over ? ' is-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragEnter={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); setOver(false); }}
        onDrop={(e) => { e.preventDefault(); setOver(false); void handleFiles(e.dataTransfer.files); }}
        style={{
          border: '1.5px dashed var(--line-strong)', borderRadius: 'var(--radius)',
          padding: 'var(--s-5)', textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--s-2)',
        }}
      >
        <span aria-hidden style={{ color: 'var(--accent)' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 15.5V4.5" />
            <path d="M8 8.5 12 4.5l4 4" />
            <path d="M5 15.5v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" />
          </svg>
        </span>
        <div style={{ fontWeight: 600 }}>Drop files here, or</div>
        <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()}>
          Choose files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="application/pdf,image/*"
          style={{ display: 'none' }}
          onChange={(e) => { void handleFiles(e.target.files); e.target.value = ''; }}
        />
        <p className="muted" style={{ margin: '2px 0 0', fontSize: 'var(--fs-sm)', maxWidth: 460 }}>
          Each upload is OCR'd by the configured route below, then its text is available to the agent.
          Pages and handwriting are confirmed once OCR runs.
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--s-4)', marginTop: 'var(--s-4)' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--s-2)', fontSize: 'var(--fs-sm)' }}>
          <span className="muted">Project</span>
          <select className="doc-select" value={project} onChange={(e) => setProject(e.target.value)}>
            {projects.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>

        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--s-2)', fontSize: 'var(--fs-sm)', cursor: 'pointer' }}>
          <input type="checkbox" checked={handwriting} onChange={(e) => setHandwriting(e.target.checked)} />
          These are handwritten
        </label>

        <span className="muted" style={{ fontSize: 'var(--fs-sm)', marginLeft: 'auto' }}>
          OCR route: <strong style={{ color: cloud ? 'var(--amber)' : 'var(--teal)' }}>{ROUTE_NAME[route]}</strong>
          {' '}{cloud ? '— pages leave the box' : '— pages stay in the box'}
        </span>
      </div>

      {toast && (
        <div
          role="status"
          style={{
            marginTop: 'var(--s-3)', display: 'flex', alignItems: 'center', gap: 'var(--s-2)',
            padding: 'var(--s-2) var(--s-3)', borderRadius: 'var(--radius-sm)',
            background: 'color-mix(in srgb, var(--green) 10%, var(--bg-2))',
            border: '1px solid color-mix(in srgb, var(--green) 45%, transparent)',
            fontSize: 'var(--fs-sm)',
          }}
        >
          <span aria-hidden style={{ color: 'var(--green)' }}>✓</span>
          <span style={{ flex: 1 }}>{toast}</span>
          <button type="button" className="btn" style={{ padding: '2px 8px' }} onClick={() => setToast(null)} aria-label="Dismiss">×</button>
        </div>
      )}
    </Panel>
  );
}
