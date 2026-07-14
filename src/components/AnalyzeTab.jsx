import React, { useState, useEffect } from 'react';
import { Sparkles, Loader2, AlertCircle, ChevronRight, Ruler, Shirt } from 'lucide-react';
import SizeChartEditor from './SizeChartEditor';
import ImageImport from './ImageImport';
import NotesLinksEditor from './NotesLinksEditor';
import { profileToPromptLines } from './ProfileModal';
import { callLLM } from '../utils/llm';
import { persistImages } from '../utils/image';
import {
  CATEGORIES,
  emptyChart,
  chartToPlain,
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

// Best-Effort-Textabgleich einer KI-generierten Referenz gegen die Garderobe:
// zuerst Marke+Name-Treffer, sonst nur Marke. Kein Treffer → null (kein Fake-Link).
function findReferencedGarment(refText, wardrobe) {
  const lower = String(refText || '').toLowerCase();
  const withNameMatch = wardrobe.find(g =>
    g.brand && g.name && lower.includes(g.brand.toLowerCase()) && lower.includes(g.name.toLowerCase())
  );
  if (withNameMatch) return withNameMatch;
  return wardrobe.find(g => g.brand && lower.includes(g.brand.toLowerCase())) || null;
}

export default function AnalyzeTab({ wardrobe, settings, storageMode, profile, prefill, onAnalyzed, onTransfer, onDirtyChange, onOpenReference }) {
  const [brand, setBrand] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Shorts');
  const [material, setMaterial] = useState('');
  const [productNote, setProductNote] = useState('');
  const [links, setLinks] = useState([]);
  const [chart, setChart] = useState(emptyChart('Shorts'));
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [lastEntry, setLastEntry] = useState(null);
  const [appliedPrefillId, setAppliedPrefillId] = useState(null);

  // „Erneut prüfen" aus dem Verlauf: Felder vorbefüllen (einmalig je prefillId).
  // Bewusst direkt im Render statt in einem Effect — das von React empfohlene
  // Muster, um eigenen State an geänderte Props anzupassen (kein Doppel-Render-Commit).
  if (prefill && prefill.prefillId !== appliedPrefillId) {
    setAppliedPrefillId(prefill.prefillId);
    setBrand(prefill.brand || '');
    setName(prefill.name || '');
    setCategory(prefill.category || 'Sonstiges');
    setMaterial(prefill.material || '');
    setProductNote(prefill.productNote || '');
    setLinks(prefill.links || []);
    setChart(prefill.chart || emptyChart(prefill.category || 'Sonstiges'));
    setImages(prefill.images || []);
    setResult(null);
    setLastEntry(null);
    setError('');
  }

  // Meldet unfertige Eingaben nach oben, damit App.jsx vor Tab-Wechsel/Reload warnen kann.
  // Nach einer erfolgreichen Analyse ist der Stand bereits im Verlauf gesichert — nicht mehr "dirty".
  useEffect(() => {
    const isDirty = !result && Boolean(
      brand.trim() || name.trim() || material.trim() || productNote.trim() ||
      links.some(l => l.trim()) || images.length > 0
    );
    onDirtyChange?.(isDirty);
  }, [brand, name, material, productNote, links, images, result, onDirtyChange]);

  const handleCategoryChange = (c) => {
    setCategory(c);
    setChart(emptyChart(c));
  };

  // KI-Vorschlag aus dem Bild-Import übernehmen (nach expliziter Bestätigung)
  const handleApplyProposal = (proposal) => {
    if (proposal.marke) setBrand(proposal.marke);
    if (proposal.produktname) setName(proposal.produktname);
    if (proposal.kategorie) setCategory(proposal.kategorie);
    if (proposal.material) setMaterial(proposal.material);
    if (proposal.chart) setChart(proposal.chart);
  };

  const relevantCount = wardrobe.filter(g => g.category === category).length;
  const canAnalyze = brand.trim() && chart.sizes.some(s => s.trim()) && wardrobe.length > 0 && !loading;

  const runAnalysis = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const wardrobeForPrompt = wardrobe.map(g => ({
        marke: g.brand,
        produkt: g.name,
        kategorie: g.category,
        besessene_groesse: g.ownedSize,
        material: g.material,
        passform: g.fit,
        passform_notiz: g.fitNote,
        notiz: g.productNote,
        groessentabelle_cm: chartToPlain(g.chart),
      }));
      const productForPrompt = {
        marke: brand,
        produkt: name,
        kategorie: category,
        material,
        notiz: productNote,
        groessentabelle_cm: chartToPlain(chart),
      };
      const profileLines = profileToPromptLines(profile);

      const systemPrompt = 'Du bist ein erfahrener Passform- und Größenexperte für Streetwear und Alltagskleidung. ' +
        'Du hilfst dabei, anhand der Garderobe eines Nutzers (Kleidungsstücke, die er besitzt, mit deren Größentabellen ' +
        'und wie sie ihm tatsächlich passen) und seiner Körperdaten die beste Größe für ein neues Produkt zu bestimmen. ' +
        'Berücksichtige: Kategorie-Ähnlichkeit (Shorts mit Shorts vergleichen etc.), Material- und Stretch-Eigenschaften ' +
        '(z.B. Baumwolle vs. Elasthan-Mix sitzen unterschiedlich), dir bekannte Schnittcharakteristik der jeweiligen ' +
        'Marken, die Körpermaße und Passform-Vorliebe des Nutzers, und vor allem die tatsächliche Passform-Rückmeldung ' +
        'des Nutzers, nicht nur welche Größe er besitzt. Antworte AUSSCHLIESSLICH mit validem JSON ohne Markdown-Codeblock, ' +
        'exakt in diesem Format: {"empfohleneGroesse": string, "confidence": "hoch" oder "mittel" oder "niedrig", ' +
        '"referenzStuecke": string array, "begruendung": string, "materialHinweis": string, "tipp": string}';

      const userPrompt =
        (profileLines.length ? 'KÖRPERDATEN DES NUTZERS:\n' + profileLines.join('\n') + '\n\n' : '') +
        'GARDEROBE DES NUTZERS:\n' + JSON.stringify(wardrobeForPrompt, null, 2) +
        '\n\nNEUES PRODUKT:\n' + JSON.stringify(productForPrompt, null, 2) +
        '\n\nWelche Größe soll der Nutzer wählen? Nenne konkret die Referenz-Kleidungsstücke aus seiner Garderobe, ' +
        'auf die du dich am meisten stützt.';

      const parsed = await callLLM({ settings, storageMode, systemPrompt, userPrompt });
      setResult(parsed);

      // Bilder für den Verlauf persistieren (best effort — Analyse zählt auch ohne Bilder)
      let persisted = [];
      try {
        persisted = await persistImages(images, storageMode);
      } catch (e) {
        console.error('Bilder konnten nicht gespeichert werden:', e);
      }
      const produkt = persisted.find(i => i.kind === 'produkt') || persisted[0] || null;

      const entry = {
        id: uid(),
        date: new Date().toISOString(),
        brand, name, category, material,
        productNote: productNote.trim(),
        links: links.map(l => l.trim()).filter(Boolean),
        chart,
        images: persisted,
        thumbnail: produkt ? produkt.url : null,
        result: parsed,
      };
      setLastEntry(entry);
      onAnalyzed(entry);
    } catch (e) {
      console.error(e);
      setError(`Analyse fehlgeschlagen: ${e.message || 'Bitte Eingaben prüfen und sicherstellen, dass dein LLM läuft.'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">

      {/* Input section */}
      <div className="lg:col-span-7 space-y-4">
        {wardrobe.length === 0 && (
          <div className="sm-card p-4 flex items-start gap-2.5 text-sm sm-warn-box">
            <AlertCircle size={18} className="sm-text-warn mt-0.5 shrink-0" />
            <span className="sm-text-warn leading-relaxed font-medium">
              Füge zuerst ein paar Kleidungsstücke in deiner Garderobe hinzu. Ohne Vergleichsbasis kann die KI keine Empfehlung aussprechen.
            </span>
          </div>
        )}

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
            <input value={brand} onChange={e => setBrand(e.target.value)} placeholder="z.B. Stüssy" className="sm-input" />
          </Field>
          <Field label="Produktname">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Big Ol' Short" className="sm-input" />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Kategorie">
            <select value={category} onChange={e => handleCategoryChange(e.target.value)} className="sm-input font-medium">
              {Object.keys(CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Material" hint="Stretch-Anteil beeinflusst die Passform stark.">
            <input value={material} onChange={e => setMaterial(e.target.value)} placeholder="z.B. 100% Cotton Denim" className="sm-input" />
          </Field>
        </div>

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

        <div className="text-xs sm-text-ink-60 bg-black/[0.02] border border-dashed sm-border-graph p-2.5 rounded font-medium">
          {relevantCount > 0
            ? `${relevantCount} passende Referenz${relevantCount === 1 ? '' : 'en'} in deiner Garderobe (Kategorie „${category}“).`
            : `Keine Referenz in der Kategorie „${category}“ — die KI vergleicht dann mit dem, was sonst am ehesten passt.`}
        </div>

        <div>
          <div className="sm-font-label uppercase tracking-wide text-xs sm-text-ink-60 mb-2 font-semibold flex items-center gap-1">
            <Ruler size={12} className="sm-text-tape" /> Größentabelle des neuen Produkts (cm)
          </div>
          <SizeChartEditor chart={chart} onChange={setChart} />
        </div>

        <div className="flex items-center gap-3 pt-2 flex-wrap">
          <button
            onClick={runAnalysis}
            disabled={!canAnalyze}
            className="sm-btn-primary flex items-center gap-2"
            type="button"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {loading ? 'Analysiere…' : 'Größe analysieren'}
          </button>
          <div className="text-[11px] sm-text-ink-60 max-w-xs leading-normal">
            Verwendet Modell: <span className="font-semibold text-black uppercase">{settings.provider === 'ollama' ? settings.ollamaModel : settings.provider}</span>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 text-sm text-[#A8412F] bg-[#A8412F]/10 border border-[#A8412F]/20 p-3 rounded">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Result section */}
      <div className="lg:col-span-5">
        {result ? (
          <div className="sm-card p-5 space-y-4 sm-bg-card shadow-lg relative overflow-hidden animate-scale-up">
            <div className="absolute top-0 right-0 left-0 h-1 bg-[#C9971F]" />

            <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-b sm-border-graph pb-3">
              <div>
                <div className="sm-font-label uppercase tracking-wide text-[11px] sm-text-ink-60 font-semibold mb-0.5">Empfohlene Größe</div>
                <div className="sm-font-mono text-4xl font-bold sm-text-ink tracking-tight">{result.empfohleneGroesse}</div>
              </div>
              <span className={`sm-badge ${result.confidence === 'hoch' ? 'sm-badge-good' : result.confidence === 'mittel' ? 'sm-badge-mid' : 'sm-badge-neutral'} font-semibold text-xs`}>
                Konfidenz: {result.confidence}
              </span>
            </div>

            {Array.isArray(result.referenzStuecke) && result.referenzStuecke.length > 0 && (
              <div>
                <div className="sm-font-label uppercase tracking-wide text-xs sm-text-ink-60 font-semibold mb-1">Referenzen aus deiner Garderobe</div>
                <ul className="text-xs space-y-1.5 bg-black/[0.02] p-2.5 border sm-border-graph rounded">
                  {result.referenzStuecke.map((r, i) => {
                    const matched = onOpenReference ? findReferencedGarment(r, wardrobe) : null;
                    return (
                      <li key={i} className="flex items-start gap-1.5">
                        <ChevronRight size={14} className="sm-text-tape mt-0.5 shrink-0" />
                        {matched ? (
                          <button
                            onClick={() => onOpenReference(matched)}
                            className="font-medium sm-link text-left"
                            title="Kleidungsstück in der Garderobe öffnen"
                            type="button"
                          >
                            {r}
                          </button>
                        ) : (
                          <span className="font-medium text-[#221F1A]/80">{r}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div>
              <div className="sm-font-label uppercase tracking-wide text-xs sm-text-ink-60 font-semibold mb-1">Begründung</div>
              <p className="text-sm sm-text-ink leading-relaxed font-normal">{result.begruendung}</p>
            </div>

            {result.materialHinweis && (
              <div>
                <div className="sm-font-label uppercase tracking-wide text-xs sm-text-ink-60 font-semibold mb-1">Material-Hinweis</div>
                <p className="text-xs sm-text-ink-60 bg-[#C9971F]/5 p-2 rounded border sm-border-graph leading-relaxed">{result.materialHinweis}</p>
              </div>
            )}

            {result.tipp && (
              <div className="sm-bg-tape-10 border sm-border-graph rounded-sm p-3.5 text-xs flex items-start gap-2.5">
                <Sparkles size={16} className="sm-text-tape mt-0.5 shrink-0" />
                <span className="font-semibold sm-text-warn leading-normal">{result.tipp}</span>
              </div>
            )}

            {/* Direkt in die Garderobe übernehmen (ohne Umweg über den Verlauf) */}
            {lastEntry && onTransfer && (
              <button
                onClick={() => onTransfer(lastEntry)}
                className="sm-btn-primary w-full flex items-center justify-center gap-2 text-sm"
                type="button"
              >
                <Shirt size={15} /> In Garderobe übernehmen
              </button>
            )}

            <div className="text-[11px] sm-text-ink-40 border-t sm-border-graph pt-2.5">
              Auch im Verlauf gespeichert. Beim Übernehmen wandert das Teil in die Garderobe und verlässt den Verlauf.
            </div>
          </div>
        ) : (
          <div className="h-full border border-dashed sm-border-graph rounded p-8 flex flex-col items-center justify-center text-center text-sm sm-text-ink-40 min-h-[300px] bg-black/[0.01]">
            <Sparkles size={36} className="mb-3 animate-pulse" />
            <div className="sm-font-label uppercase tracking-wide text-xs font-semibold sm-text-ink-60">Bereit für die Passform-Analyse</div>
            <p className="max-w-[240px] mt-1.5 text-xs">Lade Fotos hoch oder trage die Produktdaten ein und starte die Analyse. Die Empfehlung erscheint hier.</p>
          </div>
        )}
      </div>
    </div>
  );
}
