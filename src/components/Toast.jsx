import React from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

// Unaufdringliche Statusmeldung unten rechts. Wird von App.jsx gesteuert
// (Auto-Dismiss nach ein paar Sekunden) — ersetzt window.alert und stille
// console.error-Fehler bei Speichern/Löschen/Backup.
// Optional trägt `toast.action = { label, onAction }` einen Aktions-Button
// (z. B. „Rückgängig" nach dem Verschieben in den Papierkorb).
export default function Toast({ toast, onDismiss }) {
  if (!toast) return null;
  const isError = toast.type !== 'success';
  return (
    <div className="fixed bottom-4 right-4 z-[60] max-w-sm animate-scale-up" role={isError ? 'alert' : 'status'}>
      <div
        className={`flex items-start gap-2 text-sm bg-[#FBF9F3] border shadow-lg rounded-sm p-3 ${
          isError ? 'text-[#A8412F] border-[#A8412F]/40' : 'text-[#8A6A10] border-[#C9971F]/40'
        }`}
      >
        {isError
          ? <AlertCircle size={16} className="mt-0.5 shrink-0" />
          : <CheckCircle2 size={16} className="mt-0.5 shrink-0" />}
        <span className="leading-snug flex-1">{toast.message}</span>
        {toast.action && (
          <button
            onClick={() => { toast.action.onAction(); onDismiss(); }}
            className="shrink-0 font-semibold underline underline-offset-2 hover:no-underline sm-font-label uppercase tracking-wide text-xs"
            type="button"
          >
            {toast.action.label}
          </button>
        )}
        <button onClick={onDismiss} className="sm-icon-btn shrink-0 p-0.5" type="button" aria-label="Meldung schließen">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
