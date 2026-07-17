'use client';

import { useState, type ReactNode } from 'react';

// Client-side tab switching (no navigation), like the old inline script.
// Panels arrive server-rendered as props; forms inside them post to server
// actions with explicit ?tab= redirect targets, so errors land on their tab.
const TABS = [
  ['tab-icons', 'Desktop Icons'],
  ['tab-posts', 'Posts'],
  ['tab-users', 'Users'],
  ['tab-bio', 'Bio'],
] as const;

export function AdminTabs({
  initial,
  panels,
}: {
  initial: string;
  panels: Record<'tab-icons' | 'tab-posts' | 'tab-users' | 'tab-bio', ReactNode>;
}) {
  const [tab, setTab] = useState(initial);
  return (
    <>
      <menu role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} aria-selected={tab === id} aria-controls={id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </menu>
      {TABS.map(([id]) => (
        <article key={id} role="tabpanel" id={id} hidden={tab !== id}>
          {panels[id]}
        </article>
      ))}
    </>
  );
}
