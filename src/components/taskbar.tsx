'use client';

import { useEffect, useState } from 'react';
import { useWindowManager } from './window-manager';

export function Taskbar() {
  const { wins, activeId, taskbarClick } = useWindowManager();
  return (
    <footer className="taskbar">
      <button className="start-button" popoverTarget="start-menu">
        Start
      </button>
      <div className="task-buttons">
        {wins
          .filter((w) => !(w.hidden && !w.minimized)) // closed windows lose their button
          .map((w) => (
            <button
              key={w.id}
              type="button"
              className={`task-button${activeId === w.id && !w.hidden ? ' active' : ''}`}
              onClick={() => taskbarClick(w.id)}
            >
              <img alt="" src={w.icon} />
              <span>{w.title}</span>
            </button>
          ))}
      </div>
      <Clock />
    </footer>
  );
}

// the client's local time, so it renders only after mount, never SSR'd
function Clock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);
  return <time className="tray-clock">{time}</time>;
}
