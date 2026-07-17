'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Submit button that asks first via an XP-style modal. On OK it submits the
// enclosing form for real (requestSubmit skips this button's own onClick, so
// there's no re-prompt loop).
export function ConfirmSubmit({ message, children }: { message: string; children: ReactNode }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const yesRef = useRef<HTMLButtonElement>(null);
  const messageId = useId();
  // the dialog portals into <body>: it can't live inside the form (its Yes/No
  // buttons are a method="dialog" form, and forms don't nest)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <>
      <button
        ref={btnRef}
        type="submit"
        onClick={(e) => {
          e.preventDefault();
          dialogRef.current!.showModal();
          yesRef.current!.focus();
        }}
      >
        {children}
      </button>
      {mounted &&
        createPortal(
          <dialog
            ref={dialogRef}
            className="window"
            aria-labelledby={messageId}
            onClose={() => {
              const dialog = dialogRef.current!;
              if (dialog.returnValue === 'ok') btnRef.current!.form!.requestSubmit(btnRef.current);
              dialog.returnValue = ''; // Esc keeps the previous value; don't let an old 'ok' linger
            }}
          >
            <div className="title-bar">
              <div className="title-bar-text">Confirm Delete</div>
              <div className="title-bar-controls">
                <form method="dialog">
                  <button aria-label="Close"></button>
                </form>
              </div>
            </div>
            <div className="window-body">
              <div className="confirm-body">
                <img src="/icons/alert.png" alt="" width="32" height="32" />
                <p id={messageId}>{message}</p>
              </div>
              <form method="dialog" className="field-row" style={{ justifyContent: 'flex-end' }}>
                <button ref={yesRef} value="ok">
                  Yes
                </button>
                <button value="">No</button>
              </form>
            </div>
          </dialog>,
          document.body
        )}
    </>
  );
}
