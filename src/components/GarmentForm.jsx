import React, { useState } from 'react';
import { X, Ruler, Loader2 } from 'lucide-react';
import Modal from './Modal';
import SizeChartEditor from './SizeChartEditor';
import ImageImport from './ImageImport';
import NotesLinksEditor from './NotesLinksEditor';
import { persistImages } from '../utils/image';
import {
  CATEGORIES,
  FIT_OPTIONS,
  emptyChart,
  uid
} from '../utils/helpers';

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block sm-font-label uppercase tracking-wide text-xs sm-text-ink-60 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs sm-text-ink-40 mt-1">{hint}</span>}
    </label>
  );
}

export default function GarmentForm({ initial, onSave, onCancel, settings, storageMode }) {
  const [brand, setBrand] = useState(initial ? initial.brand : '');
  const [name, setName] = useState(initial ? initial.name : '');
  const [category, setCategory] = useState(initial ? initial.category : 'Shorts');
  const [material, setMaterial] = useState(initial ? initial.material : '');
  const [ownedSize, setOwnedSize] = useState(initial ? initial.ownedSize : '');
  const [fit, setFit] = useState(initial ? initial.fit : FIT_OPTIONS[0]);
  const [fitNote, setFitNote] = useState(initial ? initial.fitNote : '');
  const [chart, setChart] = useState(initial ? initial.chart : emptyChart('Shorts'));
  const [images, setImages] = useState(initial?.images || []);
  const [productNote, setProductNote] = useState(initial?.productNote || '');
  const [links, setLinks] = useState(initial?.links || []);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const handleCategoryChange = (newCat) => {
    setCategory(newCat);
    if (!initial) setChart(emptyChart(newCat));
  };

  // KI-Vorschlag aus dem Bild-Import übernehmen (nur nach expliziter Bestätigung)
  const handleApplyProposal = (proposal) => {
    if (proposal.marke) setBrand(proposal.marke);
    if (proposal.produktname) setName(proposal.produktname);
    if (proposal.kategorie) setCategory(proposal.kategorie);
    if (proposal.material) setMaterial(proposal.material);
    if (proposal.chart) setChart(proposal.chart);
  };

  const canSave = brand.trim() && name.trim() && chart.sizes.some(s => s.trim());

  // Erkennt unfertige Eingaben, um vor versehentlichem Verwerfen zu warnen.
  const isDirty = () => {
    if (!initial) {
      return Boolean(
        brand.trim() || name.trim() || material.trim() || ownedSize.trim() || fitNote.trim() ||
        productNote.trim() || links.some(l => l.trim()) || images.length > 0 ||
        chart.sizes.some((s, i) => s.trim() && chart.values[i]?.some(v => v !== ''))
      );
    }
    return (
      brand !== initial.brand || name !== initial.name || category !== initial.category ||
      material !== initial.material || ownedSize !== initial.ownedSize || fit !== initial.fit ||
      fitNote !== (initial.fitNote || '') || productNote !== (initial.productNote || '') ||
      JSON.stringify(links) !== JSON.stringify(initial.links || []) ||
      JSON.stringify(images) !== JSON.stringify(initial.images || []) ||
      JSON.stringify(chart) !== JSON.stringify(initial.chart)
    );
  };

  const handleCancel = () => {
    if (isDirty() && !window.confirm('Ungespeicherte Änderungen verwerfen?')) return;
    onCancel();
  };

  const handleSubmit = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const persisted = await persistImages(images, storageMode);
      const produkt = persisted.find(i => i.kind === 'produkt') || persisted[0] || null;
      onSave({
        id: initial ? initial.id : uid(),
        brand: brand.trim(),
        name: name.trim(),
        category,
        material: material.trim(),
        ownedSize: ownedSize.trim(),
        fit,
        fitNote: fitNote.trim(),
        productNote: productNote.trim(),
        links: links.map(l => l.trim()).filter(Boolean),
        chart,
        images: persisted,
        thumbnail: produkt ? produkt.url : null,
        createdAt: initial?.createdAt || new Date().toISOString(),
      });
    } catch (e) {
      console.error(e);
      setSaveError(`Speichern fehlgeschlagen: ${e.message}`);
      setSaving(false);
    }
  };

  return (
    <Modal
      onClose={handleCancel}
      label={initial ? 'Kleidungsstück bearbeiten' : 'Neues Kleidungsstück'}
      maxWidthClass="max-w-2xl"
      className="overflow-y-auto"
      style={{ maxHeight: '90vh' }}
    >
        <div className="flex items-center justify-between px-5 py-4 border-b sm-border-graph bg-black/[0.02]">
          <h3 className="sm-font-label uppercase tracking-wide text-sm sm-text-ink flex items-center gap-2 font-semibold">
            <Ruler size={16} className="sm-text-tape" />
            {initial ? 'Kleidungsstück bearbeiten' : 'Neues Kleidungsstück'}
          </h3>
          <button onClick={handleCancel} className="sm-icon-btn p-1 hover:bg-black/5 rounded" type="button"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <ImageImport
            images={images}
            onChange={setImages}
            settings={settings}
            storageMode={storageMode}
            category={category}
            onApplyProposal={handleApplyProposal}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Marke">
              <input 
                value={brand} 
                onChange={e => setBrand(e.target.value)} 
                placeholder="z.B. Zara" 
                className="sm-input" 
              />
            </Field>
            <Field label="Produktname">
              <input 
                value={name} 
                onChange={e => setName(e.target.value)} 
                placeholder="z.B. Bermuda Shorts" 
                className="sm-input" 
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Kategorie">
              <select 
                value={category} 
                onChange={e => handleCategoryChange(e.target.value)} 
                className="sm-input"
              >
                {Object.keys(CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Material">
              <input 
                value={material} 
                onChange={e => setMaterial(e.target.value)} 
                placeholder="z.B. 100% Baumwolle" 
                className="sm-input" 
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Deine Größe">
              <input 
                value={ownedSize} 
                onChange={e => setOwnedSize(e.target.value)} 
                placeholder="z.B. XL" 
                className="sm-input" 
              />
            </Field>
            <Field label="Wie sitzt es wirklich?" hint="Wichtig für die KI — echte Passform angeben.">
              <select 
                value={fit} 
                onChange={e => setFit(e.target.value)} 
                className="sm-input font-medium"
              >
                {FIT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Notiz zur Passform (optional)">
            <input
              value={fitNote}
              onChange={e => setFitNote(e.target.value)}
              placeholder="z.B. an den Oberschenkeln eng, Taille eher locker"
              className="sm-input"
            />
          </Field>

          <div className="pt-1 border-t border-dashed sm-border-graph">
            <div className="pt-3">
              <NotesLinksEditor
                note={productNote}
                links={links}
                onChangeNote={setProductNote}
                onChangeLinks={setLinks}
              />
            </div>
          </div>

          <div className="pt-2">
            <div className="sm-font-label uppercase tracking-wide text-xs sm-text-ink-60 mb-2 font-semibold">Größentabelle (in cm)</div>
            <SizeChartEditor chart={chart} onChange={setChart} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t sm-border-graph sm-bg-card bg-black/[0.02]">
          {saveError && (
            <span className="text-xs text-[#A8412F] mr-auto max-w-[60%]">{saveError}</span>
          )}
          <button onClick={handleCancel} className="sm-btn-ghost" type="button">Abbrechen</button>
          <button onClick={handleSubmit} disabled={!canSave || saving} className="sm-btn-primary flex items-center gap-1.5" type="button">
            {saving && <Loader2 size={13} className="animate-spin" />}
            {saving ? 'Speichert…' : 'Speichern'}
          </button>
        </div>
    </Modal>
  );
}
