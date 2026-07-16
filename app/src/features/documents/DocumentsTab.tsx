// Documents — the file-manager analogue for the sandbox. Upload scans and
// forms, watch OCR progress, confirm the handwriting the model was unsure of,
// and see at a glance which documents stayed private (local route) and which
// went to a cloud OCR provider. Store data is read-only; uploads live in local
// React state and merge on top of the store list, newest first.
import { useMemo, useState } from 'react';
import type { DocumentInfo } from '../../domain/types';
import { store } from '../../data/adapter';
import { Panel, WhenToUse } from '../../ui/primitives';
import { UploadPanel } from './UploadPanel';
import { DocumentList } from './DocumentList';
import { ReviewQueue } from './ReviewQueue';
import { Summary } from './Summary';
import { projectsOf } from './format';
import './documents.css';

export default function DocumentsTab() {
  const stored = store.documents();
  const [uploads, setUploads] = useState<DocumentInfo[]>([]);

  // Combined view: optimistic uploads first, then the store documents.
  const docs = useMemo(() => [...uploads, ...stored], [uploads, stored]);
  const projects = useMemo(() => projectsOf(stored), [stored]);

  const addUploads = (docsToAdd: DocumentInfo[]) => setUploads((prev) => [...docsToAdd, ...prev]);
  const reconcile = (id: string, doc: DocumentInfo) =>
    setUploads((prev) => prev.map((d) => (d.id === id ? doc : d)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}>
      <WhenToUse>
        <strong>When to use Documents.</strong> Upload scans and forms for the agent to read, watch OCR progress, and
        confirm the handwriting fields the model was unsure of. The route marker on each row tells you which documents
        stayed private — read in the box — and which went out to a cloud OCR provider, so you can keep sensitive forms
        off the wire.
      </WhenToUse>

      <UploadPanel projects={projects} onUploaded={addUploads} onReconcile={reconcile} />

      <ReviewQueue docs={docs} />

      <DocumentList docs={docs} />

      <Panel title="Summary" hint="Across uploads and stored documents">
        <Summary docs={docs} />
      </Panel>
    </div>
  );
}
