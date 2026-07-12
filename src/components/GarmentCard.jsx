import React from 'react';
import { Pencil, Trash2, StickyNote, Link as LinkIcon } from 'lucide-react';

function FitBadge({ fit }) {
  let cls = 'sm-badge-neutral';
  if (fit === 'Perfekte Passform') cls = 'sm-badge-good';
  else if (fit === 'Zu eng' || fit === 'Zu weit') cls = 'sm-badge-bad';
  else if (fit === 'Etwas eng' || fit === 'Etwas locker') cls = 'sm-badge-mid';
  return <span className={`sm-badge ${cls}`}>{fit || 'Unbekannt'}</span>;
}

export default function GarmentCard({ garment, onEdit, onDelete, onOpenDetail }) {
  const thumbnail = garment.thumbnail || garment.images?.[0]?.url || null;
  const imageCount = garment.images?.length || 0;

  return (
    <div
      className="sm-card flex flex-col gap-3 sm-bg-card relative overflow-hidden group cursor-pointer p-5"
      onClick={() => onOpenDetail && onOpenDetail(garment)}
      title="Details & Fotos ansehen"
    >
      {/* Decorative colored line on the card left border depending on fit */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-1 transition-all duration-300 z-10 ${
          garment.fit === 'Perfekte Passform' ? 'bg-[#C9971F]' :
          (garment.fit === 'Zu eng' || garment.fit === 'Zu weit') ? 'bg-[#A8412F]' :
          (garment.fit === 'Etwas eng' || garment.fit === 'Etwas locker') ? 'bg-[#6B6455]' : 'bg-[#D8D0BC]'
        }`}
      />

      {/* Hochgeladenes Produktfoto als Thumbnail */}
      {thumbnail && (
        <div className="relative -mx-5 -mt-5 h-40 overflow-hidden border-b sm-border-graph bg-black/5">
          <img
            src={thumbnail}
            alt={`${garment.brand} ${garment.name}`}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
          />
          {imageCount > 1 && (
            <span className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">
              {imageCount} Fotos
            </span>
          )}
        </div>
      )}

      <div className="flex items-start justify-between gap-2 pl-1">
        <div className="min-w-0">
          <div className="sm-font-label uppercase tracking-wide text-xs sm-text-tape font-semibold">{garment.category}</div>
          <div className="font-medium sm-text-ink text-base leading-snug truncate mt-0.5">
            {garment.brand} <span className="sm-text-ink-60 font-normal">— {garment.name}</span>
          </div>
        </div>
        <div className="flex gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(garment); }}
            className="sm-icon-btn p-1.5 hover:bg-black/5 rounded transition-all"
            title="Bearbeiten"
            type="button"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(garment.id); }}
            className="sm-icon-btn-danger p-1.5 hover:bg-[#A8412F]/10 rounded transition-all"
            title="Löschen"
            type="button"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap text-sm pl-1">
        <span className="sm-font-mono sm-text-ink bg-black/5 px-2 py-0.5 rounded text-xs font-semibold">Größe {garment.ownedSize || '—'}</span>
        <FitBadge fit={garment.fit} />
        {garment.productNote && <StickyNote size={13} className="sm-text-ink-40" title="Enthält eine Notiz" />}
        {(garment.links || []).filter(Boolean).length > 0 && <LinkIcon size={13} className="sm-text-ink-40" title="Enthält Links" />}
      </div>

      {garment.material && (
        <div className="text-xs sm-text-ink-60 border-t sm-border-graph pt-2 pl-1 flex items-center justify-between">
          <span className="font-medium">Material:</span>
          <span className="truncate max-w-[80%]">{garment.material}</span>
        </div>
      )}

      {garment.fitNote && (
        <div className="text-xs sm-text-ink-60 italic bg-black/[0.02] border border-dashed sm-border-graph p-2 rounded leading-relaxed pl-2">
          „{garment.fitNote}“
        </div>
      )}
    </div>
  );
}
