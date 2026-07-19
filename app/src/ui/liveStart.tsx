// The live+real+empty onboarding — the mirror image of the demo layer. Where
// demo.tsx flags a fabricated world and self-erases the moment real data answers,
// this card only appears at the one honest moment it makes sense: the box is live
// against a REAL datastore (liveStatus()==='live' && dataSource()==='real') and
// there is nothing in it yet. It offers the single act that starts the real
// record — provisioning the first project — and then erases itself, because once
// an owner and a vault exist the world is no longer empty and there is nothing
// left to onboard. Same self-erase discipline, opposite edge of the mock→live arc.
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { liveStatus, dataSource, provisionProject } from '../data/live';
import { store } from '../data/adapter';

// Shown only on a genuinely real live plane whose world is still empty. In demo,
// degraded or seeded-live mode this is false, so the card never appears; and the
// instant the first provision lands an owner + vault the world stops being empty
// and the gate closes — the card cannot outlive the state it exists to resolve.
function shouldShow(): boolean {
  return (
    liveStatus() === 'live' &&
    dataSource() === 'real' &&
    store.owners().length === 0 &&
    store.vaults().length === 0
  );
}

// Accent tint marks this as the moment of going real (the demo layer owns --demo;
// this is its counterpart). color-mix over the token, mirroring the WhenToUse formula.
const liveTint: CSSProperties = {
  color: 'var(--accent)',
  borderColor: 'color-mix(in srgb, var(--accent) 45%, transparent)',
  background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
  fontWeight: 700,
};

const inputStyle: CSSProperties = {
  flex: '1 1 220px',
  padding: '7px 10px',
  background: 'var(--bg-3)',
  color: 'var(--fg-0)',
  border: '1px solid var(--line-strong)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 'var(--fs-sm)',
};

export function LiveStart() {
  const [project, setProject] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A re-render tick: provisionProject() hydrates the adapter store synchronously,
  // but that mutation is outside React. Bumping this after a successful provision
  // re-runs shouldShow() against the now-populated store, which returns null and
  // erases the card.
  const [, bump] = useState(0);

  // Gate evaluated on every render so the card self-erases the moment the world
  // is no longer live+real+empty — including immediately after a provision.
  if (!shouldShow()) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = project.trim();
    if (!name) {
      setError('Enter a project name to provision.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      await provisionProject(name);
      bump((n) => n + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className="card"
      role="region"
      aria-labelledby="live-start-title"
      style={{
        padding: 'var(--s-5)',
        display: 'grid',
        gap: 'var(--s-4)',
        borderColor: 'color-mix(in srgb, var(--accent) 40%, transparent)',
        background: 'color-mix(in srgb, var(--accent) 6%, transparent)',
      }}
    >
      <header style={{ display: 'grid', gap: 'var(--s-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
          <span className="badge" style={liveTint}>LIVE · EMPTY</span>
          <h3 id="live-start-title" style={{ margin: 0, fontSize: 'var(--fs-xl)', fontWeight: 680 }}>
            This box is live with a real datastore — and nothing in it yet.
          </h3>
        </div>
        <p className="secondary" style={{ margin: 0, fontSize: 'var(--fs-sm)', lineHeight: 1.6 }}>
          This is the moment the demo world is gone for good. There are no owners, no vaults and no
          actions — the first project you provision starts the real record, and from here every action
          is attributed to who did it and written to the audit log.
        </p>
      </header>

      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 'var(--s-2)' }}>
        <label htmlFor="live-start-project" style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>
          Project name
        </label>
        <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            id="live-start-project"
            type="text"
            value={project}
            onChange={(e) => setProject(e.target.value)}
            disabled={pending}
            placeholder="e.g. project-aurora"
            autoComplete="off"
            style={inputStyle}
          />
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? 'Provisioning…' : 'Provision first project'}
          </button>
        </div>
        {error && (
          <p role="alert" style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--rose)' }}>
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
