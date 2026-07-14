import React, { useEffect, useRef } from 'react';

// Gemeinsamer Overlay-Rahmen für alle Dialoge (GarmentForm, GarmentDetail,
// ProfileModal, SettingsModal): schließt per ESC und Backdrop-Klick, setzt
// ARIA-Attribute und hält den Tab-Fokus im Dialog.
export default function Modal({ onClose, label, maxWidthClass = 'max-w-lg', className = '', style, children }) {
  const panelRef = useRef(null);

  useEffect(() => {
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement;
    panel?.focus();

    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      // Nur sichtbare Elemente — versteckte file-Inputs etc. überspringen
      const focusables = Array.from(panel.querySelectorAll(focusableSelector))
        .filter(el => el.getClientRects().length > 0);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 z-50 animate-fade-in"
      style={{ background: 'rgba(34,31,26,0.45)' }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`sm-bg-paper w-full rounded-sm shadow-xl sm-border-graph border outline-none animate-scale-up ${maxWidthClass} ${className}`}
        style={style}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
