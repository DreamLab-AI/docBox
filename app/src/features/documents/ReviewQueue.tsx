// Review queue: documents whose OCR flagged low-confidence fields — the
// handwriting a person needs to confirm. No open model reads messy cursive
// reliably, so anything below the confidence threshold lands here. "Open for
// review" is a local demo action; it shows an inline note, no backend.
import { useState } from 'react';
import type { DocumentInfo } from '../../domain/types';
import { Panel, OwnerTag, EmptyState } from '../../ui/primitives';
import { TypeIcon, RouteMarker } from './parts';
import { formatPct } from './format';

export function ReviewQueue({ docs }: { docs: DocumentInfo[] }) {
  const queue = docs.filter((d) => d.ocr === 'review').sort((a, b) => b.uploadedAt - a.uploadedAt);
  const [opened, setOpened] = useState<Set<string>>(() => new Set());

  const open = (id: string) =>
    setOpened((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

  return (
    <Panel
      title="Review queue"
      hint="Handwriting fields the model was unsure of"
      right={<span className="badge" style={{ color: queue.length ? 'var(--amber)' : 'var(--fg-2)', borderColor: 'color-mix(in srgb, var(--amber) 45%, transparent)' }}>{queue.length} waiting</span>}
    >
      <p className="muted" style={{ margin: '0 0 var(--s-3)', fontSize: 'var(--fs-sm)', maxWidth: 680 }}>
        No open model reads messy cursive reliably, so any field below the confidence threshold comes here for a person
        to confirm. Confirming a document releases its text to the agent.
      </p>

      {queue.length === 0 ? (
        <EmptyState>Nothing waiting — every document read cleanly.</EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
          {queue.map((d) => {
            const isOpen = opened.has(d.id);
            return (
              <div
                key={d.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--s-3)',
                  padding: 'var(--s-3)', background: 'var(--bg-2)', borderRadius: 'var(--radius-sm)',
                  border: '1px solid color-mix(in srgb, var(--amber) 40%, transparent)',
                  borderLeft: '3px solid var(--amber)',
                }}
              >
                <TypeIcon mime={d.mime} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="mono" style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, wordBreak: 'break-all' }}>{d.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', flexWrap: 'wrap', marginTop: 3, fontSize: 'var(--fs-xs)', color: 'var(--fg-2)' }}>
                    <OwnerTag ownerId={d.ownerId} />
                    <span className="mono">{d.project}</span>
                    <span style={{ color: 'var(--amber)', fontWeight: 600 }}>
                      {d.fieldsForReview ?? 0} field{(d.fieldsForReview ?? 0) === 1 ? '' : 's'} to confirm
                    </span>
                    {typeof d.confidence === 'number' && <span>lowest {formatPct(d.confidence)}</span>}
                    <RouteMarker route={d.ocrRoute} />
                  </div>
                  {isOpen && (
                    <p role="status" style={{ margin: '6px 0 0', fontSize: 'var(--fs-xs)', color: 'var(--fg-1)' }}>
                      Review panel would open here — the flagged fields shown next to the page crop for a person to confirm or correct.
                    </p>
                  )}
                </div>
                {isOpen ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--accent)', fontSize: 'var(--fs-sm)', fontWeight: 600 }}>opened</span>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={() => open(d.id)}>Open for review</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
