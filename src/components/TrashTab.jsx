import React from 'react';
import { Trash2, RotateCcw } from 'lucide-react';
import { daysLeftInTrash, TRASH_RETENTION_DAYS } from '../utils/helpers';

// Eine Karte im Papierkorb: zeigt das gelöschte Teil samt Restlaufzeit und bietet
// Wiederherstellen (zurück in die Garderobe) oder endgültiges Löschen an.
function TrashCard({ item, onRestore, onPurge }) {
  const thumbnail = item.thumbnail || item.images?.[0]?.url || null;
  const daysLeft = daysLeftInTrash(item.deletedAt);
  const expiryLabel = daysLeft <= 0 ? 'Wird gelöscht' : `Noch ${daysLeft} Tag${daysLeft === 1 ? '' : 'e'}`;

  return (
    <div className="sm-card flex flex-col gap-3 sm-bg-card relative overflow-hidden p-5">
      {/* Vorschaubild (abgedimmt, da gelöscht) */}
      {thumbnail && (
        <div className="relative -mx-5 -mt-5 h-40 overflow-hidden border-b sm-border-graph bg-black/5">
          <img src={thumbnail} alt={`${item.brand} ${item.name}`} className="w-full h-full object-cover opacity-80" />
          <span className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide">
            {expiryLabel}
          </span>
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="sm-font-label uppercase tracking-wide text-xs sm-text-tape font-semibold">{item.category}</div>
          <div className="font-medium sm-text-ink text-base leading-snug truncate mt-0.5">
            {item.brand} <span className="sm-text-ink-60 font-normal">— {item.name}</span>
          </div>
        </div>
        {/* Ohne Bild fehlt das Overlay-Badge — Restlaufzeit hier zeigen */}
        {!thumbnail && (
          <span className="shrink-0 sm-font-label uppercase tracking-wide text-[10px] font-semibold sm-text-ink-60 bg-black/5 px-1.5 py-0.5 rounded">
            {expiryLabel}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => onRestore(item.id)}
          className="sm-btn-primary flex items-center gap-1.5 text-xs"
          type="button"
        >
          <RotateCcw size={13} /> Wiederherstellen
        </button>
        <button
          onClick={() => {
            if (window.confirm(`„${item.brand} — ${item.name}" endgültig löschen? Das lässt sich nicht rückgängig machen.`)) {
              onPurge(item.id);
            }
          }}
          className="sm-icon-btn-danger flex items-center gap-1.5 text-xs px-3 py-1.5 border border-[#A8412F]/30 rounded hover:bg-[#A8412F]/10 transition-all ml-auto"
          type="button"
        >
          <Trash2 size={13} /> Endgültig löschen
        </button>
      </div>
    </div>
  );
}

// Papierkorb-Ansicht: aus der Garderobe gelöschte Teile, 30 Tage wiederherstellbar,
// danach automatische endgültige Löschung (Prune serverseitig bzw. beim Laden).
export default function TrashTab({ trash, onRestore, onPurge, onEmptyTrash }) {
  if (trash.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-20 gap-4 border border-dashed sm-border-graph rounded bg-[#FBF9F3]/60 max-w-4xl mx-auto shadow-inner">
        <Trash2 size={48} className="sm-text-ink-40" />
        <div>
          <div className="sm-font-label uppercase tracking-wide text-sm sm-text-ink font-semibold">Papierkorb ist leer</div>
          <p className="text-sm sm-text-ink-60 max-w-md mt-2 px-4 leading-relaxed">
            Aus der Garderobe gelöschte Teile landen hier und lassen sich {TRASH_RETENTION_DAYS} Tage lang
            wiederherstellen. Danach werden sie automatisch endgültig entfernt.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
        <div className="text-sm sm-text-ink-60 font-medium">
          {trash.length} Objekt{trash.length === 1 ? '' : 'e'} im Papierkorb
        </div>
        <button
          onClick={() => {
            if (window.confirm(`Papierkorb wirklich leeren? ${trash.length} Objekt${trash.length === 1 ? '' : 'e'} werden endgültig gelöscht.`)) {
              onEmptyTrash();
            }
          }}
          className="sm-icon-btn-danger flex items-center gap-1.5 text-xs px-3 py-1.5 border border-[#A8412F]/30 rounded hover:bg-[#A8412F]/10 transition-all"
          type="button"
        >
          <Trash2 size={14} /> Papierkorb leeren
        </button>
      </div>

      <p className="text-xs sm-text-ink-40 mb-6 pb-4 border-b border-dashed sm-border-graph">
        Objekte werden {TRASH_RETENTION_DAYS} Tage nach dem Löschen automatisch endgültig entfernt.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {trash.map(item => (
          <TrashCard key={item.id} item={item} onRestore={onRestore} onPurge={onPurge} />
        ))}
      </div>
    </div>
  );
}
