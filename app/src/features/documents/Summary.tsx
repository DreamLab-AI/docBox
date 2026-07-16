// Summary: documents by OCR status, and the privacy split — how many were read
// in the box (local) versus sent to a cloud provider. Counts the same combined
// set the list shows, so uploads are reflected here too.
import type { DocumentInfo, OcrStatus } from '../../domain/types';
import { OcrChip } from './parts';
import { isCloudRoute, OCR_LABEL } from './format';

const STATUS_ORDER: OcrStatus[] = ['pending', 'processing', 'done', 'review', 'failed'];

export function Summary({ docs }: { docs: DocumentInfo[] }) {
  const byStatus = (s: OcrStatus) => docs.filter((d) => d.ocr === s).length;
  const cloud = docs.filter((d) => isCloudRoute(d.ocrRoute)).length;
  const local = docs.length - cloud;
  const localPct = docs.length ? (local / docs.length) * 100 : 0;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--s-5)' }}>
      <div>
        <div className="muted" style={{ fontSize: 'var(--fs-xs)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 'var(--s-2)' }}>By status</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)' }}>
          {STATUS_ORDER.map((s) => (
            <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} title={OCR_LABEL[s]}>
              <OcrChip status={s} />
              <strong style={{ fontFamily: 'var(--font-mono)' }}>{byStatus(s)}</strong>
            </span>
          ))}
        </div>
      </div>

      <div>
        <div className="muted" style={{ fontSize: 'var(--fs-xs)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 'var(--s-2)' }}>Where OCR ran</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-4)', marginBottom: 'var(--s-2)', fontSize: 'var(--fs-sm)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
            <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--teal)' }}>{local}</strong>
            <span className="muted">local · private</span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
            <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--amber)' }}>{cloud}</strong>
            <span className="muted">sent to a cloud provider</span>
          </span>
        </div>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'var(--bg-3)' }} title={`${local} local, ${cloud} cloud`}>
          <span style={{ width: `${localPct}%`, background: 'var(--teal)' }} />
          <span style={{ width: `${100 - localPct}%`, background: 'var(--amber)' }} />
        </div>
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 'var(--fs-xs)' }}>
          Local kept the page in the box. A cloud route sent the page image out for stronger accuracy on messy handwriting.
        </p>
      </div>
    </div>
  );
}
