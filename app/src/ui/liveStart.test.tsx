// Unit tests for the live+real+empty onboarding card. The data plane is mocked
// so liveStatus()/dataSource() are drivable, but provisionProject() and the
// adapter's hydrate() are the REAL implementations — the card's self-erase is
// driven by genuine store state, and a mocked fetch stands in for the server.
// The card is the mirror of the demo layer: absent everywhere except the one
// honest moment (live + real + empty), and gone again the instant a project exists.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Keep provisionProject + hydrate real; drive only liveStatus/dataSource.
vi.mock('../data/live', async (importActual) => {
  const actual = await importActual<typeof import('../data/live')>();
  return {
    ...actual,
    liveStatus: vi.fn(() => 'live'),
    dataSource: vi.fn(() => 'real'),
  };
});

import { LiveStart } from './liveStart';
import * as live from '../data/live';
import { hydrate, store, type World } from '../data/adapter';
import type { Owner, VaultInfo } from '../domain/types';

const NOW = 1_760_000_000_000;

function emptyWorld(): World {
  return {
    now: NOW,
    owners: [], sessions: [], agents: [], elements: [], actions: [], config: [],
    snapshots: [], beads: [], audit: [], vaults: [], documents: [], modules: [],
    system: {
      activeStack: 'blue', imageTag: 'dev', uptimeHours: 0, pendingRebuildChanges: 0,
      auditChainVerifiedAt: 0, localModel: 'none', providersOnline: [],
    },
  };
}

const provisionedOwner: Owner = {
  id: 'entra:t1:o1', name: 'Ada Lovelace', upn: 'ada@dreamlab.uk', role: 'admin', colour: '#6ea8fe',
};
const provisionedVault: VaultInfo = {
  id: 'vault-aurora', project: 'project-aurora', state: 'locked', sizeMb: 0,
};

function provisionedWorld(): World {
  return { ...emptyWorld(), owners: [provisionedOwner], vaults: [provisionedVault] };
}

const originalFetch = global.fetch;

beforeEach(() => {
  vi.mocked(live.liveStatus).mockReturnValue('live');
  vi.mocked(live.dataSource).mockReturnValue('real');
  hydrate(emptyWorld());
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('LiveStart — visibility gate (mirror of the demo self-erase)', () => {
  it('renders on a genuinely real live plane whose world is empty', () => {
    render(<LiveStart />);
    expect(
      screen.getByText('This box is live with a real datastore — and nothing in it yet.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Project name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Provision first project' })).toBeInTheDocument();
  });

  it('is a labelled region', () => {
    render(<LiveStart />);
    expect(
      screen.getByRole('region', { name: 'This box is live with a real datastore — and nothing in it yet.' }),
    ).toBeInTheDocument();
  });

  it('is absent in demo mode (liveStatus mock)', () => {
    vi.mocked(live.liveStatus).mockReturnValue('mock');
    const { container } = render(<LiveStart />);
    expect(container.firstChild).toBeNull();
  });

  it('is absent when live but the datastore is only seeded', () => {
    vi.mocked(live.liveStatus).mockReturnValue('live');
    vi.mocked(live.dataSource).mockReturnValue('seeded');
    const { container } = render(<LiveStart />);
    expect(container.firstChild).toBeNull();
  });

  it('is absent when live+real but the world already has owners/vaults', () => {
    hydrate(provisionedWorld());
    const { container } = render(<LiveStart />);
    expect(container.firstChild).toBeNull();
  });
});

describe('LiveStart — provisioning', () => {
  it('POSTs the project name to /api/provision (identity never in the body)', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, world: provisionedWorld() }) } as Response),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<LiveStart />);
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'project-aurora' } });
    fireEvent.click(screen.getByRole('button', { name: 'Provision first project' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/provision$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ project: 'project-aurora' });
  });

  it('on success: hydrates the returned world and erases the card', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, world: provisionedWorld() }) } as Response),
    ) as unknown as typeof fetch;

    render(<LiveStart />);
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'project-aurora' } });
    fireEvent.click(screen.getByRole('button', { name: 'Provision first project' }));

    // The real hydrate ran (world visible via the store)…
    await waitFor(() => expect(store.owners()).toHaveLength(1));
    expect(store.owners()[0].name).toBe('Ada Lovelace');
    expect(store.vaults()[0].project).toBe('project-aurora');
    // …and the card self-erases now the world is no longer empty.
    expect(
      screen.queryByText('This box is live with a real datastore — and nothing in it yet.'),
    ).toBeNull();
  });

  it('trims blank input and refuses to provision', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<LiveStart />);
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Provision first project' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Enter a project name/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('on failure: surfaces the server message inline and keeps the card', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 409, json: () => Promise.resolve({ error: 'A project with that name already exists.' }) } as Response),
    ) as unknown as typeof fetch;

    render(<LiveStart />);
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'project-aurora' } });
    fireEvent.click(screen.getByRole('button', { name: 'Provision first project' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A project with that name already exists.');
    // The card is still here (provision did not succeed).
    expect(
      screen.getByText('This box is live with a real datastore — and nothing in it yet.'),
    ).toBeInTheDocument();
  });
});
