// Operations tab + sub-components. Covers OperationsTab (sub-tab switching),
// SnapshotsSection (restore-point timeline + rollback flow), AuditSection
// (hash-chain table, verify banner, owner filter), VaultsSection (lock/unlock
// flips) and the shared ConfirmDialog (confirm → simulated progress → success,
// cancel, backdrop and Escape handling).
//
// The simulated progress uses window.setTimeout (STEP_MS = 520) and AuditSection's
// verify uses a 460ms beat, so the whole suite runs on fake timers and advances
// them explicitly. The store is read-only and never mutated; where a broken /
// unanchored chain is needed (states the deterministic mock never produces) the
// store.audit accessor is spied to return a crafted trail — the store itself is
// untouched.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act, cleanup } from '@testing-library/react';
import OperationsTab from './OperationsTab';
import { SnapshotsSection } from './SnapshotsSection';
import { AuditSection } from './AuditSection';
import { VaultsSection } from './VaultsSection';
import { ConfirmDialog } from './ConfirmDialog';
import { store } from '../../data/adapter';

// Deterministic mock facts, read (never written) via the store seam.
const AUDIT = store.audit();
const OWNERS = store.owners();
const NOW = store.now();

/** Run all scheduled fake timers past `ms`, flushing React effects inside act. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// OperationsTab: sub-tab switching + the WhenToUse guidance block.
// ---------------------------------------------------------------------------
describe('OperationsTab', () => {
  it('renders the WhenToUse block and the Snapshots sub-tab by default', () => {
    render(<OperationsTab />);
    expect(screen.getByText(/When to use Operations\./)).toBeInTheDocument();
    // Default sub-tab is Snapshots.
    expect(screen.getByText(/Every overhaul that rebuilds the system takes a restore point first\./)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Snapshots & rollback' })).toHaveAttribute('aria-selected', 'true');
  });

  it('switches to Audit trail and Vaults, keeping the WhenToUse block', () => {
    render(<OperationsTab />);

    fireEvent.click(screen.getByRole('tab', { name: 'Audit trail' }));
    expect(screen.getByText(/Append-only\. The agent can add to it; it cannot alter or delete a record\./)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Audit trail' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/When to use Operations\./)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Vaults' }));
    expect(screen.getByText(/Each project is a separate encrypted workspace\./)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Vaults' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/When to use Operations\./)).toBeInTheDocument();

    // Back to Snapshots.
    fireEvent.click(screen.getByRole('tab', { name: 'Snapshots & rollback' }));
    expect(screen.getByText(/Every overhaul that rebuilds the system takes a restore point first\./)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// SnapshotsSection: the restore-point timeline + rollback flow.
// ---------------------------------------------------------------------------
describe('SnapshotsSection', () => {
  it('renders each restore point with label, sha, initiator, healthcheck and status', () => {
    render(<SnapshotsSection />);

    // Labels for all four points.
    expect(screen.getByText('auth provider swap')).toBeInTheDocument();
    expect(screen.getByText('billing module split')).toBeInTheDocument();
    expect(screen.getByText('add polars to python bundle')).toBeInTheDocument();
    expect(screen.getByText('baseline image v0.3.1')).toBeInTheDocument();

    // Status text for each distinct status.
    expect(screen.getAllByText('Promoted').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Auto-rolled back')).toBeInTheDocument();
    expect(screen.getByText('Candidate · in-flight')).toBeInTheDocument();

    // Healthcheck text for each distinct healthcheck.
    expect(screen.getAllByText('Healthcheck passed').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Healthcheck failed')).toBeInTheDocument();
    expect(screen.getByText('Healthcheck running')).toBeInTheDocument();

    // sha before/after: snap-4 (candidate) has no shaAfter → "building…".
    expect(screen.getByText('a91c3f')).toBeInTheDocument();
    expect(screen.getAllByText('building…').length).toBeGreaterThanOrEqual(1);

    // Initiators rendered via OwnerTag.
    expect(screen.getAllByText('Dana Okoro').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Sam Whitfield').length).toBeGreaterThanOrEqual(1);

    // "serving now" marker is on the newest promoted point (billing module split).
    const servingCard = screen.getByText('billing module split').closest('li')!;
    expect(within(servingCard).getByText('serving now')).toBeInTheDocument();
  });

  it('shows the "Roll back to here" button only on a non-active promoted point', () => {
    render(<SnapshotsSection />);
    // Only snap-1 (promoted, not serving) is rollback-able.
    const buttons = screen.getAllByRole('button', { name: /Roll back to here/ });
    expect(buttons).toHaveLength(1);
    const rollbackCard = screen.getByText('baseline image v0.3.1').closest('li')!;
    expect(within(rollbackCard).getByRole('button', { name: /Roll back to here/ })).toBeInTheDocument();
  });

  it('opens the rollback ConfirmDialog explaining only the definition plane reverts', () => {
    render(<SnapshotsSection />);
    fireEvent.click(screen.getByRole('button', { name: /Roll back to here/ }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Roll back to/)).toBeInTheDocument();
    expect(within(dialog).getByText(/This reverts the system-definition plane/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Left untouched:/)).toBeInTheDocument();
    expect(within(dialog).getByText(/project vault data and the/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Roll back the tooling' })).toBeInTheDocument();
  });

  it('cancelling the rollback dialog closes it and leaves the serving marker in place', () => {
    render(<SnapshotsSection />);
    fireEvent.click(screen.getByRole('button', { name: /Roll back to here/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Marker unchanged: still on billing module split.
    const servingCard = screen.getByText('billing module split').closest('li')!;
    expect(within(servingCard).getByText('serving now')).toBeInTheDocument();
  });

  it('confirming the rollback runs the progress and moves the serving-now marker', async () => {
    render(<SnapshotsSection />);
    fireEvent.click(screen.getByRole('button', { name: /Roll back to here/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Roll back the tooling' }));

    // 4 steps + 1 done tick at STEP_MS = 520 → completes by ~2600ms.
    await advance(520 * 6);

    expect(screen.getByText(/Rolled back\. User data and the audit trail were not touched\./)).toBeInTheDocument();

    // Close the success modal.
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // The marker moved to the rolled-back point; the previously-serving point
    // now offers a rollback button.
    const nowServing = screen.getByText('baseline image v0.3.1').closest('li')!;
    expect(within(nowServing).getByText('serving now')).toBeInTheDocument();
    const previouslyServing = screen.getByText('billing module split').closest('li')!;
    expect(within(previouslyServing).getByRole('button', { name: /Roll back to here/ })).toBeInTheDocument();
  });
});

describe('SnapshotsSection (crafted timelines)', () => {
  const snap = (over: Record<string, unknown>) => ({
    id: 's', ts: NOW - 3600_000, label: 'restore point', shaBefore: 'aa11bb',
    status: 'promoted', proposalSummary: 'a change', initiatorOwnerId: OWNERS[0].id,
    healthcheck: 'pass', ...over,
  });

  it('falls back to shaBefore in the rollback dialog when a promoted point has no shaAfter', () => {
    // Two promoted points: the newest serves; the older (no shaAfter) is the
    // rollback target, exercising the `shaAfter ?? shaBefore` fallback.
    vi.spyOn(store, 'snapshots').mockReturnValue([
      snap({ id: 's-new', label: 'current stack', shaAfter: 'ffffff', ts: NOW - 60_000 }),
      snap({ id: 's-old', label: 'earlier stack', shaAfter: undefined, shaBefore: 'c0ffee', ts: NOW - 7200_000 }),
    ] as never);

    render(<SnapshotsSection />);
    fireEvent.click(screen.getByRole('button', { name: /Roll back to here/ }));
    const dialog = screen.getByRole('dialog');
    // The restore text uses shaBefore because shaAfter is absent.
    expect(within(dialog).getAllByText('c0ffee').length).toBeGreaterThanOrEqual(1);
  });

  it('has no serving marker or rollback button when nothing is promoted', () => {
    vi.spyOn(store, 'snapshots').mockReturnValue([
      snap({ id: 's-c', status: 'candidate', healthcheck: 'running', shaAfter: undefined }),
    ] as never);

    render(<SnapshotsSection />);
    expect(screen.queryByText('serving now')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Roll back to here/ })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AuditSection: hash-chain table, verify banner, owner filter.
// ---------------------------------------------------------------------------
describe('AuditSection', () => {
  it('renders every audit record as a chain row', () => {
    const { container } = render(<AuditSection />);
    expect(container.querySelectorAll('.ops-audit-row')).toHaveLength(AUDIT.length);
    // Header + verify control present.
    expect(screen.getByRole('button', { name: /Verify chain/i })).toBeInTheDocument();
    expect(screen.getByText('prevHash → hash')).toBeInTheDocument();
  });

  it('verifies the (valid) chain and shows the green intact banner with counts and anchor info', async () => {
    render(<AuditSection />);
    fireEvent.click(screen.getByRole('button', { name: /Verify chain/i }));

    // While walking, the button is busy and no banner yet.
    expect(screen.getByRole('button', { name: /Walking .* records/i })).toBeDisabled();

    await advance(500); // past the 460ms beat

    const status = screen.getByRole('status');
    expect(within(status).getByText(/Chain intact\./)).toBeInTheDocument();
    expect(within(status).getByText(/records verified/)).toBeInTheDocument();
    expect(status.textContent).toContain(String(AUDIT.length));
    // 4 records are still awaiting the next anchor in the mock.
    expect(within(status).getByText(/awaiting the next anchor/)).toBeInTheDocument();
  });

  it('narrows the view with the owner filter without changing the record set', () => {
    // Pick an owner that owns some — but not all — records.
    const counts = new Map<string, number>();
    for (const r of AUDIT) counts.set(r.userId, (counts.get(r.userId) ?? 0) + 1);
    const filterOwner = OWNERS.find((o) => {
      const c = counts.get(o.id) ?? 0;
      return c > 0 && c < AUDIT.length;
    })!;
    const expected = counts.get(filterOwner.id)!;

    const { container } = render(<AuditSection />);
    expect(container.querySelectorAll('.ops-audit-row')).toHaveLength(AUDIT.length);

    fireEvent.click(screen.getByRole('button', { name: new RegExp(filterOwner.name) }));

    expect(container.querySelectorAll('.ops-audit-row')).toHaveLength(expected);
    expect(screen.getByText(/Filtered view:/)).toBeInTheDocument();
    expect(screen.getByText(/these records are not adjacent in the chain/)).toBeInTheDocument();

    // Back to all.
    fireEvent.click(screen.getByRole('button', { name: /^All/ }));
    expect(container.querySelectorAll('.ops-audit-row')).toHaveLength(AUDIT.length);
    expect(screen.queryByText(/Filtered view:/)).not.toBeInTheDocument();
  });

  it('reports a broken chain when a link does not match', async () => {
    const rec = (over: Record<string, unknown>) => ({
      seq: 1, eventId: 'e', ts: NOW, userId: OWNERS[0].id, agentId: 'ag-1',
      kind: 'tool_call', summary: 'did a thing', hash: '000000', prevHash: '000000',
      anchored: false, ...over,
    });
    // Varied kinds exercise the kind colour + label branches; the second record's
    // prevHash does not match the first record's hash → break at seq 2.
    const tampered = [
      rec({ seq: 1, kind: 'gate_approval', hash: 'aaaaaa', prevHash: '000000', anchored: true }),
      rec({ seq: 2, kind: 'policy_deny', hash: 'bbbbbb', prevHash: 'ZZZZZZ' }),
      rec({ seq: 3, kind: 'rollback', hash: 'cccccc', prevHash: 'bbbbbb' }),
      rec({ seq: 4, kind: 'mystery_kind', hash: 'dddddd', prevHash: 'cccccc', agentId: undefined }),
    ];
    vi.spyOn(store, 'audit').mockReturnValue(tampered as never);

    render(<AuditSection />);
    // Unknown kind falls back to the raw kind label.
    expect(screen.getByText('mystery_kind')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Verify chain/i }));
    await advance(500);

    const status = screen.getByRole('status');
    expect(within(status).getByText(/Chain broken\./)).toBeInTheDocument();
    expect(status.textContent).toMatch(/before a mismatch/);
  });

  it('reports intact but unanchored when no record is anchored yet', async () => {
    const rec = (over: Record<string, unknown>) => ({
      seq: 1, eventId: 'e', ts: NOW, userId: OWNERS[0].id, agentId: 'ag-1',
      kind: 'file_change', summary: 'edit', hash: '000000', prevHash: '000000',
      anchored: false, ...over,
    });
    const chain = [
      rec({ seq: 1, hash: 'aaaaaa', prevHash: '000000' }),
      rec({ seq: 2, hash: 'bbbbbb', prevHash: 'aaaaaa' }),
    ];
    vi.spyOn(store, 'audit').mockReturnValue(chain as never);

    render(<AuditSection />);
    fireEvent.click(screen.getByRole('button', { name: /Verify chain/i }));
    await advance(500);

    const status = screen.getByRole('status');
    expect(within(status).getByText(/Chain intact\./)).toBeInTheDocument();
    expect(within(status).getByText(/No records are anchored yet\./)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// VaultsSection: lock/unlock flips held in local state.
// ---------------------------------------------------------------------------
describe('VaultsSection', () => {
  it('renders a card per vault with its lock state and size', () => {
    render(<VaultsSection />);
    const aurora = screen.getByText('project-aurora').closest('.card')!;
    expect(within(aurora).getByText('Unlocked')).toBeInTheDocument();
    expect(within(aurora).getByText('412 MB')).toBeInTheDocument();
    expect(within(aurora).getByRole('button', { name: 'Lock' })).toBeInTheDocument();

    const borealis = screen.getByText('project-borealis').closest('.card')!;
    expect(within(borealis).getByText('Locked')).toBeInTheDocument();
    expect(within(borealis).getByRole('button', { name: 'Unlock' })).toBeInTheDocument();
  });

  it('unlocks a locked vault after confirming, flipping it to unlocked locally', async () => {
    render(<VaultsSection />);
    const borealis = () => screen.getByText('project-borealis').closest('.card')!;

    // Open, then cancel — vault stays locked.
    fireEvent.click(within(borealis()).getByRole('button', { name: 'Unlock' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(borealis()).getByText('Locked')).toBeInTheDocument();

    // Reopen and confirm the unlock.
    fireEvent.click(within(borealis()).getByRole('button', { name: 'Unlock' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/releases the vault's wrapped key via your Entra session/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Unlock' }));

    // 3 steps + 1 done tick.
    await advance(520 * 5);
    expect(screen.getByText(/project-borealis is unlocked and readable for this session\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    // Flipped: now unlocked, shows a Lock button and the acting admin owner.
    expect(within(borealis()).getByText('Unlocked')).toBeInTheDocument();
    expect(within(borealis()).getByRole('button', { name: 'Lock' })).toBeInTheDocument();
    expect(within(borealis()).getByText('Dana Okoro')).toBeInTheDocument();
  });

  it('locks an unlocked vault after confirming, flipping it back to locked locally', async () => {
    render(<VaultsSection />);
    const aurora = () => screen.getByText('project-aurora').closest('.card')!;

    fireEvent.click(within(aurora()).getByRole('button', { name: 'Lock' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Locking shreds the decrypted files and the in-memory key/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lock' }));

    await advance(520 * 5);
    expect(screen.getByText(/project-aurora is locked\. Only the ciphertext remains at rest\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(within(aurora()).getByText('Locked')).toBeInTheDocument();
    expect(within(aurora()).getByRole('button', { name: 'Unlock' })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ConfirmDialog: confirm → progress → success, plus cancel / backdrop / Escape.
// ---------------------------------------------------------------------------
describe('ConfirmDialog', () => {
  const baseProps = {
    open: true as boolean,
    onClose: () => {},
    title: 'Do the thing',
    confirmLabel: 'Proceed',
    steps: ['Step one', 'Step two', 'Step three'],
    doneMessage: 'All done.',
    children: <p>This explains the action.</p>,
  };

  it('returns null when closed', () => {
    const { container } = render(<ConfirmDialog {...baseProps} open={false} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the confirm content with a default (primary) confirm button', () => {
    render(<ConfirmDialog {...baseProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('This explains the action.')).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Proceed' });
    expect(confirm).toHaveClass('btn-primary');
    expect(confirm).not.toHaveClass('btn-danger');
  });

  it('renders a danger-tinted confirm button when tone is danger', () => {
    render(<ConfirmDialog {...baseProps} tone="danger" />);
    expect(screen.getByRole('button', { name: 'Proceed' })).toHaveClass('btn-danger');
  });

  it('advances through the progress steps to success and fires onConfirmed once', async () => {
    const onConfirmed = vi.fn();
    const { container } = render(<ConfirmDialog {...baseProps} onConfirmed={onConfirmed} />);

    fireEvent.click(screen.getByRole('button', { name: 'Proceed' }));

    // After one step: an active spinner is showing (progress mid-flight).
    await advance(520);
    expect(container.querySelector('.ops-spin')).not.toBeNull();
    expect(onConfirmed).not.toHaveBeenCalled();

    // Finish: 3 steps + 1 done tick.
    await advance(520 * 3);
    expect(screen.getByText('All done.')).toBeInTheDocument();
    expect(onConfirmed).toHaveBeenCalledTimes(1);

    // The success "Done" button invokes onClose.
    const onClose = vi.fn();
    cleanup();
    render(<ConfirmDialog {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Proceed' }));
    await advance(520 * 4);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('completes without throwing when no onConfirmed is provided', async () => {
    render(<ConfirmDialog {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Proceed' }));
    await advance(520 * 4);
    expect(screen.getByText('All done.')).toBeInTheDocument();
  });

  it('cancels via the Cancel button', () => {
    const onClose = vi.fn();
    render(<ConfirmDialog {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on backdrop mousedown while confirming, but not once running', async () => {
    const onClose = vi.fn();
    const { container } = render(<ConfirmDialog {...baseProps} onClose={onClose} />);
    const backdrop = container.querySelector('.ops-backdrop') as HTMLElement;

    // Mousedown on the dialog card itself is swallowed (stopPropagation).
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();

    // Mousedown on the backdrop while confirming closes.
    fireEvent.mouseDown(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);

    // Now start running: backdrop mousedown is ignored.
    onClose.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Proceed' }));
    await advance(520); // mid-run, not finished
    fireEvent.mouseDown(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape while confirming, but ignores Escape while running', async () => {
    const onClose = vi.fn();
    render(<ConfirmDialog {...baseProps} onClose={onClose} />);

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    // Start running: Escape is a no-op mid-run.
    onClose.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Proceed' }));
    await advance(520);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    // A non-Escape key is ignored too.
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
