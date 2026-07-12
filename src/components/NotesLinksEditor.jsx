import React from 'react';
import { Plus, X, Link as LinkIcon, StickyNote } from 'lucide-react';

// Wiederverwendbarer Editor für Produkt-Notizen + beliebig viele Links.
// Genutzt in GarmentForm und AnalyzeTab.
export default function NotesLinksEditor({ note, links, onChangeNote, onChangeLinks }) {
  const safeLinks = links || [];

  const updateLink = (idx, value) => {
    const next = [...safeLinks];
    next[idx] = value;
    onChangeLinks(next);
  };
  const addLink = () => onChangeLinks([...safeLinks, '']);
  const removeLink = (idx) => onChangeLinks(safeLinks.filter((_, i) => i !== idx));

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="sm-font-label uppercase tracking-wide text-xs sm-text-ink-60 mb-1 flex items-center gap-1.5">
          <StickyNote size={12} className="sm-text-tape" /> Notizen zum Produkt
        </span>
        <textarea
          value={note || ''}
          onChange={e => onChangeNote(e.target.value)}
          rows={2}
          placeholder="z.B. Cropped Fit, fällt klein aus, Second-Hand gekauft…"
          className="sm-input resize-y"
        />
      </label>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="sm-font-label uppercase tracking-wide text-xs sm-text-ink-60 flex items-center gap-1.5">
            <LinkIcon size={12} className="sm-text-tape" /> Links
          </span>
          <button
            onClick={addLink}
            className="flex items-center gap-1 text-xs sm-text-tape hover:text-black px-2 py-1 border border-dashed sm-border-graph rounded transition-all sm-font-label uppercase tracking-wide"
            type="button"
          >
            <Plus size={12} /> Link
          </button>
        </div>
        {safeLinks.map((link, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={link}
              onChange={e => updateLink(i, e.target.value)}
              placeholder="https://…"
              className="sm-input flex-1 font-mono text-xs"
            />
            <button onClick={() => removeLink(i)} className="sm-icon-btn-danger p-1.5 hover:bg-[#A8412F]/10 rounded shrink-0" type="button">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
