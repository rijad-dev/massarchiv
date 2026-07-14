import React, { useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, ImagePlus, Trash2, Star, Pencil, Loader2, Ruler, StickyNote, Link as LinkIcon } from 'lucide-react';
import Modal from './Modal';
import { downscaleImage, persistImages } from '../utils/image';
import { linkLabel, normalizeUrl } from '../utils/helpers';

function FitBadge({ fit }) {
  let cls = 'sm-badge-neutral';
  if (fit === 'Perfekte Passform') cls = 'sm-badge-good';
  else if (fit === 'Zu eng' || fit === 'Zu weit') cls = 'sm-badge-bad';
  else if (fit === 'Etwas eng' || fit === 'Etwas locker') cls = 'sm-badge-mid';
  return <span className={`sm-badge ${cls}`}>{fit || 'Unbekannt'}</span>;
}

// Detailansicht eines Kleidungsstücks: Bildergalerie (beliebig viele Fotos —
// Vorderseite, Rückseite, Größentabelle, …), Bilder hinzufügen/löschen,
// Titelbild wählen, Stammdaten + Größentabelle read-only.
export default function GarmentDetail({ garment, storageMode, onClose, onEdit, onDelete, onUpdate }) {
  const fileInputRef = useRef(null);
  const [index, setIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const images = garment.images || [];
  const safeIndex = images.length === 0 ? 0 : Math.min(index, images.length - 1);
  const current = images[safeIndex] || null;
  const isLocalMode = storageMode !== 'sqlite';

  const addFiles = async (fileList) => {
    setError('');
    setUploading(true);
    try {
      const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
      if (files.length === 0) return;
      const added = [];
      for (const file of files) {
        added.push(await (isLocalMode ? downscaleImage(file, 800, 0.7) : downscaleImage(file, 1600, 0.85)));
      }
      const persisted = await persistImages(added, storageMode);
      const nextImages = [...images, ...persisted];
      onUpdate({
        ...garment,
        images: nextImages,
        thumbnail: garment.thumbnail || persisted[0]?.url || null,
      });
      setIndex(nextImages.length - 1);
    } catch (e) {
      console.error(e);
      setError(`Bild-Upload fehlgeschlagen: ${e.message}`);
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (img) => {
    if (!window.confirm('Dieses Bild wirklich löschen?')) return;
    const nextImages = images.filter(i => i.id !== img.id);
    const thumbnail = garment.thumbnail === img.url
      ? (nextImages[0]?.url || null)
      : garment.thumbnail;
    onUpdate({ ...garment, images: nextImages, thumbnail });
    setIndex(0);
  };

  const setAsThumbnail = (img) => {
    onUpdate({
      ...garment,
      thumbnail: img.url,
      images: images.map(i => ({ ...i, kind: i.id === img.id ? 'produkt' : (i.kind === 'produkt' ? 'sonstiges' : i.kind) })),
    });
  };

  const chart = garment.chart;
  const hasChartValues = chart && chart.sizes?.some(s => s && s.trim());

  return (
    <Modal
      onClose={onClose}
      label={`${garment.brand} — ${garment.name}`}
      maxWidthClass="max-w-3xl"
      className="overflow-y-auto"
      style={{ maxHeight: '92vh' }}
    >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b sm-border-graph bg-black/[0.02]">
          <div className="min-w-0">
            <div className="sm-font-label uppercase tracking-wide text-[10px] sm-text-tape font-semibold">{garment.category}</div>
            <h3 className="font-semibold text-lg sm-text-ink truncate">
              {garment.brand} <span className="sm-text-ink-60 font-normal">— {garment.name}</span>
            </h3>
          </div>
          <button onClick={onClose} className="sm-icon-btn p-1 hover:bg-black/5 rounded shrink-0" type="button"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Galerie */}
          {current ? (
            <div className="space-y-2">
              <div className="relative border sm-border-graph rounded-sm overflow-hidden bg-black/5 flex items-center justify-center" style={{ height: 'min(45vh, 340px)' }}>
                <img src={current.url} alt="" className="max-w-full max-h-full object-contain" />
                {images.length > 1 && (
                  <>
                    <button
                      onClick={() => setIndex((safeIndex - 1 + images.length) % images.length)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5"
                      type="button" title="Vorheriges Bild"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      onClick={() => setIndex((safeIndex + 1) % images.length)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5"
                      type="button" title="Nächstes Bild"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </>
                )}
                <span className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">
                  {safeIndex + 1} / {images.length}
                </span>
                {garment.thumbnail === current.url && (
                  <span className="absolute top-2 left-2 bg-[#C9971F] text-white text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide">
                    Titelbild
                  </span>
                )}
                <div className="absolute top-2 right-2 flex gap-1.5">
                  {garment.thumbnail !== current.url && (
                    <button
                      onClick={() => setAsThumbnail(current)}
                      className="bg-black/50 hover:bg-[#C9971F] text-white rounded p-1.5 transition-colors"
                      type="button" title="Als Titelbild setzen"
                    >
                      <Star size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => removeImage(current)}
                    className="bg-black/50 hover:bg-[#A8412F] text-white rounded p-1.5 transition-colors"
                    type="button" title="Bild löschen"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Thumbnail-Leiste */}
              <div className="flex gap-2 flex-wrap items-center">
                {images.map((img, i) => (
                  <button
                    key={img.id}
                    onClick={() => setIndex(i)}
                    className={`w-14 h-14 border rounded-sm overflow-hidden shrink-0 transition-all ${i === safeIndex ? 'border-[#C9971F] ring-1 ring-[#C9971F]' : 'sm-border-graph opacity-70 hover:opacity-100'}`}
                    type="button"
                  >
                    <img src={img.url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-14 h-14 border border-dashed sm-border-graph rounded-sm flex items-center justify-center sm-text-ink-40 hover:border-[#C9971F] hover:text-[#C9971F] transition-colors shrink-0"
                  type="button" title="Weitere Bilder hinzufügen"
                >
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full border border-dashed sm-border-graph rounded p-8 flex flex-col items-center justify-center gap-2 text-sm sm-text-ink-40 hover:border-[#C9971F] hover:text-[#C9971F] transition-colors"
              type="button"
            >
              {uploading ? <Loader2 size={24} className="animate-spin" /> : <ImagePlus size={24} />}
              <span className="sm-font-label uppercase tracking-wide text-xs font-semibold">
                {uploading ? 'Lädt hoch…' : 'Fotos hinzufügen (Vorderseite, Rückseite, …)'}
              </span>
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
          />

          {error && <div className="text-xs text-[#A8412F] bg-[#A8412F]/10 border border-[#A8412F]/20 p-2.5 rounded">{error}</div>}

          {/* Stammdaten */}
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <span className="sm-font-mono sm-text-ink bg-black/5 px-2 py-0.5 rounded text-xs font-semibold">Größe {garment.ownedSize || '—'}</span>
            <FitBadge fit={garment.fit} />
            {garment.material && <span className="text-xs sm-text-ink-60">Material: <span className="font-medium">{garment.material}</span></span>}
          </div>

          {garment.fitNote && (
            <div className="text-xs sm-text-ink-60 italic bg-black/[0.02] border border-dashed sm-border-graph p-2 rounded leading-relaxed">
              „{garment.fitNote}“
            </div>
          )}

          {garment.productNote && (
            <div className="text-xs sm-text-ink-60 flex items-start gap-1.5">
              <StickyNote size={13} className="sm-text-tape mt-0.5 shrink-0" />
              <span className="italic leading-relaxed">{garment.productNote}</span>
            </div>
          )}

          {(garment.links || []).filter(Boolean).length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {garment.links.filter(Boolean).map((l, i) => (
                <a
                  key={i}
                  href={normalizeUrl(l)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs sm-link flex items-center gap-1"
                >
                  <LinkIcon size={11} /> {linkLabel(normalizeUrl(l))}
                </a>
              ))}
            </div>
          )}

          {/* Größentabelle (read-only) */}
          {hasChartValues && (
            <div>
              <div className="sm-font-label uppercase tracking-wide text-xs sm-text-ink-60 mb-2 font-semibold flex items-center gap-1">
                <Ruler size={12} className="sm-text-tape" /> Größentabelle (cm)
              </div>
              <div className="overflow-x-auto border sm-border-graph rounded-sm sm-bg-card">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-black/5">
                      <th className="p-2 text-left sm-font-label uppercase tracking-wide sm-text-ink-60 border-b border-r sm-border-graph">Größe</th>
                      {chart.measurements.map((m, i) => (
                        <th key={i} className="p-2 text-right sm-font-label uppercase tracking-wide sm-text-ink-60 border-b border-r sm-border-graph">{m}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {chart.sizes.map((s, si) => (
                      s && s.trim() ? (
                        <tr key={si}>
                          <td className="p-2 sm-font-mono font-semibold border-b border-r sm-border-graph">{s}</td>
                          {chart.measurements.map((_, mi) => (
                            <td key={mi} className="p-2 sm-font-mono text-right border-b border-r sm-border-graph">
                              {(chart.values[si] && chart.values[si][mi]) || '—'}
                            </td>
                          ))}
                        </tr>
                      ) : null
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between gap-2 px-5 py-4 border-t sm-border-graph sm-bg-card bg-black/[0.02] flex-wrap">
          <button
            onClick={() => { if (window.confirm('Dieses Kleidungsstück wirklich löschen?')) { onDelete(garment.id); onClose(); } }}
            className="sm-icon-btn-danger flex items-center gap-1.5 text-xs px-3 py-1.5 border border-[#A8412F]/30 rounded hover:bg-[#A8412F]/10 transition-all"
            type="button"
          >
            <Trash2 size={13} /> Löschen
          </button>
          <div className="flex gap-2 flex-wrap">
            <button onClick={onClose} className="sm-btn-ghost" type="button">Schließen</button>
            <button onClick={() => onEdit(garment)} className="sm-btn-primary flex items-center gap-1.5" type="button">
              <Pencil size={13} /> Bearbeiten
            </button>
          </div>
        </div>
    </Modal>
  );
}
