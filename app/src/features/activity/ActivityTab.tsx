// Activity — two coordinated views of the same event stream.
//   Left:  the action feed (newest first) with owner/kind/status/text filters.
//   Right: the agent spawn tree, one block per session.
// Selecting in the tree filters the feed; the feed header shows the active
// filters as removable chips. One Filters object is the single source of truth.
import { useMemo, useState } from 'react';
import { store } from '../../data/adapter';
import { Panel, WhenToUse } from '../../ui/primitives';
import { ActionFeed } from './ActionFeed';
import { AgentTree } from './AgentTree';
import { EMPTY_FILTERS, filterActions, countActionsByAgent } from './activity.helpers';
import type { Filters } from './activity.helpers';

export default function ActivityTab() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const update = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const clearAll = () => setFilters(EMPTY_FILTERS);

  const actions = store.actions();          // ascending by time (frozen contract)
  const owners = store.owners();
  const sessions = store.sessions();
  const agents = store.agents();
  const now = store.now();

  // Action counts come from the full stream, not the filtered slice, so an
  // agent's total holds steady no matter how you cut the feed.
  const actionCounts = useMemo(() => countActionsByAgent(actions), [actions]);
  const visible = useMemo(() => filterActions(actions, filters), [actions, filters]);

  return (
    <div>
      <FeatureStyle />
      <WhenToUse>
        <strong>Watch what the agents are doing.</strong> Use this when you're following a live session
        and want the play-by-play, auditing one agent's actions, or scanning for anything blocked or
        failed. Pick a session or agent on the right to narrow the feed; the filters at the top cut by
        owner, action kind, status and label text. Denied and rolled-back events carry a coloured edge
        so they don't slip past.
      </WhenToUse>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-4)', alignItems: 'flex-start' }}>
        <Panel title="Action feed" hint="Every agent action, newest first"
          style={{ flex: '3 1 460px', minWidth: 0 }}>
          <ActionFeed
            visible={visible}
            total={actions.length}
            filters={filters}
            owners={owners}
            now={now}
            update={update}
            clearAll={clearAll}
          />
        </Panel>

        <Panel title="Agent spawn tree" hint="Sessions and the agents they spawned"
          style={{ flex: '2 1 320px', minWidth: 0 }}>
          <AgentTree
            sessions={sessions}
            agents={agents}
            actionCounts={actionCounts}
            filters={filters}
            now={now}
            update={update}
          />
        </Panel>
      </div>
    </div>
  );
}

// Hover affordances the inline styles can't express. Scoped to this feature's
// class names so it can't bleed into other tabs.
function FeatureStyle() {
  return (
    <style>{`
      .act-row:hover { background: var(--bg-2) !important; }
      .act-node:hover { background: var(--bg-3) !important; }
      .act-agent:hover { color: var(--accent); text-decoration: underline; }
      .act-chip:hover, .act-seg:hover { border-color: var(--line-strong); }
      .act-remove:hover { background: color-mix(in srgb, var(--rose) 16%, transparent) !important; border-color: color-mix(in srgb, var(--rose) 40%, transparent) !important; }
      .act-more:hover { background: var(--bg-2) !important; }
      .act-link:hover { text-decoration: underline; }
      .act-scroll::-webkit-scrollbar { width: 10px; }
      .act-scroll::-webkit-scrollbar-thumb { background: var(--line-strong); border-radius: 100px; border: 3px solid var(--bg-1); }
    `}</style>
  );
}
