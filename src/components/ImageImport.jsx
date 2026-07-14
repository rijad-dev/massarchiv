import React, { useRef, useState, useEffect } from 'react';
import { ImagePlus, Sparkles, Loader2, X, AlertCircle, Check, Trash2, TriangleAlert, Clock, Lightbulb } from 'lucide-react';
import SizeChartEditor from './SizeChartEditor';
import { CATEGORIES, DEFAULT_OLLAMA_VISION_MODEL } from '../utils/helpers';
import { prepareImage, imageToBase64 } from '../utils/image';
import { callLLM } from '../utils/llm';

// --- Stufe 1: Bild-Klassifikation + Produkt-Metadaten (ohne Tabelle) ---------
// Bewusst von der Tabellen-Extraktion getrennt: Vision-Modelle liefern deutlich
// bessere Tabellen, wenn sie sich auf GENAU EINE Aufgabe konzentrieren.
function buildMetaPrompts(category, imageCount) {
  const knownCategories = Object.keys(CATEGORIES).join(', ');
  const systemPrompt =
    'Du bist ein präzises Bildanalyse-System für Kleidung. Antworte AUSSCHLIESSLICH mit validem JSON ' +
    'ohne Markdown-Codeblock, exakt in diesem Format: {"produktBildIndex": Zahl oder null, ' +
    '"tabellenBildIndex": Zahl oder null, "marke": string, "produktname": string, "kategorie": string, ' +
    '"material": string}. Regeln: (1) produktBildIndex = 0-basierter Index des Bildes, das das ' +
    'Kleidungsstück selbst zeigt, sonst null. (2) tabellenBildIndex = 0-basierter Index des Bildes, ' +
    'das eine Größentabelle zeigt, sonst null. (3) kategorie ist exakt eine aus dieser Liste: [' +
    knownCategories + ']. (4) Nicht erkennbare Textfelder als leeren String. Nichts erfinden.';

  const userPrompt =
    `Es folgen ${imageCount} Bild${imageCount === 1 ? '' : 'er'} (Index 0 bis ${imageCount - 1}). ` +
    (category ? `Aktuell gewählte Kategorie (nur als Hinweis): ${category}. ` : '') +
    'Bestimme Produktbild, Größentabellen-Bild, Marke, Produktname, Kategorie und Material.';

  return { systemPrompt, userPrompt };
}

// --- Stufe 2: Nur die Größentabelle, zeilenbasiert -----------------------------
// Zeilen-Objekte mit benannten Werten statt values[i][j]-Matrix: die Zuordnung
// Größe → Maß → Wert passiert über Schlüssel, nicht über Indizes — das verhindert
// vertauschte Zeilen/Spalten.
function buildTablePrompts(singleImage) {
  const systemPrompt =
    'Du bist ein präzises OCR-System für Größentabellen von Kleidung. ' +
    (singleImage
      ? 'Du erhältst genau ein Bild einer Größentabelle. '
      : 'Eines der Bilder zeigt eine Größentabelle — nutze genau dieses. ') +
    'Lies die Tabelle sorgfältig Zeile für Zeile. Antworte AUSSCHLIESSLICH mit validem JSON ohne ' +
    'Markdown-Codeblock, exakt in diesem Format: {"masse": string[], "zeilen": [{"groesse": string, ' +
    '"werte": {"<Maßname>": "<Zahl>"}}]}. Regeln: (1) "masse" sind die Maß-Spaltenüberschriften der ' +
    'Tabelle (z. B. Brustumfang, Bund, Länge) — exakt so viele, wie die Tabelle wirklich hat. ' +
    '(2) Jede Tabellenzeile wird ein Objekt in "zeilen": "groesse" ist die Größenbezeichnung der Zeile ' +
    '(z. B. S, M, L, 38, 42, One Size), "werte" ordnet jedem Maßnamen den Wert GENAU AUS DIESER ZEILE zu. ' +
    '(3) Alle Maße in Zentimetern — Zoll/Inch umrechnen (1 inch = 2,54 cm). Werte als Zahlen-Strings ' +
    'ohne Einheit (Dezimalpunkt statt Komma). Übernimm die Zahlen EXAKT wie in der Tabelle abgedruckt — ' +
    'niemals eigenmächtig verdoppeln, halbieren oder runden. (4) Prüfe jede Zuordnung doppelt: Wert und ' +
    'Größe müssen in derselben Zeile stehen. (5) Nicht lesbare Werte im "werte"-Objekt weglassen. Nichts ' +
    'erfinden. (6) Ist keine Größentabelle erkennbar, antworte mit {"masse": [], "zeilen": []}.';

  const userPrompt = 'Extrahiere die vollständige Größentabelle aus dem Bild.';
  return { systemPrompt, userPrompt };
}

// Zeilenbasierte Tabellen-Antwort → Chart-Modell {measurements, sizes, values}
function normalizeTable(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const zeilen = Array.isArray(raw.zeilen) ? raw.zeilen : [];
  const keySet = new Set(
    (Array.isArray(raw.masse) ? raw.masse : []).map(m => String(m ?? '').trim()).filter(Boolean)
  );
  zeilen.forEach(z => {
    if (z && typeof z.werte === 'object' && z.werte !== null) {
      Object.keys(z.werte).forEach(k => {
        const key = String(k).trim();
        if (key) keySet.add(key);
      });
    }
  });

  const measurements = [...keySet];
  const rows = zeilen
    .map(z => ({
      groesse: String(z?.groesse ?? '').trim(),
      werte: (z && typeof z.werte === 'object' && z.werte !== null) ? z.werte : {}
    }))
    .filter(r => r.groesse);

  if (measurements.length === 0 || rows.length === 0) return null;

  const sizes = rows.map(r => r.groesse);
  const values = rows.map(r =>
    measurements.map(m => {
      const v = r.werte[m];
      return v === null || v === undefined ? '' : String(v).replace(',', '.').trim();
    })
  );
  return { measurements, sizes, values };
}

// Erkennt Umfangs-Spalten, die vermutlich „flach" (halber Umfang) gemessen sind:
// z. B. Chest 56 statt 112. Nur Umfangs-Maße, deren Median unter einem
// plausiblen Ganzumfang-Schwellwert liegt, werden geflaggt. Rein heuristisch —
// der Nutzer entscheidet per Button, nichts wird automatisch geändert.
const CIRCUMFERENCE_PATTERNS = [
  { re: /(brust|chest|ober\s*weite|oberweite)/i, threshold: 70 },
  { re: /(bund|waist|taille|taillen)/i, threshold: 60 },
  { re: /(h(ü|ue)ft|hip|ges(ä|ae)ß|gesaess)/i, threshold: 70 },
  { re: /umfang/i, threshold: 70 },
];

function median(nums) {
  if (!nums.length) return NaN;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function flagHalfMeasurements(chart) {
  if (!chart) return [];
  const flags = [];
  chart.measurements.forEach((m, mi) => {
    const pattern = CIRCUMFERENCE_PATTERNS.find(p => p.re.test(m));
    if (!pattern) return;
    // "1/2", "halb", "flat" im Namen → sicher flach gemessen
    const explicitHalf = /(1\s*\/\s*2|½|halb|flat|flach)/i.test(m);
    const nums = chart.values
      .map(row => parseFloat(String(row[mi]).replace(',', '.')))
      .filter(v => !Number.isNaN(v));
    if (!nums.length) return;
    if (explicitHalf || median(nums) < pattern.threshold) {
      flags.push(mi);
    }
  });
  return flags;
}

// "12s" unter einer Minute, sonst "1m 05s" — kurz, konsistent mit den
// abgekürzten Einheiten der App (cm, kg, %), kein Doppelpunkt-Format.
function formatDuration(ms) {
  if (ms == null || Number.isNaN(ms)) return '–';
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}m ${seconds}s`;
}

// Ein Element, zwei Einsatzorte (Toolbar während des Laufs, Vorschlags-Panel
// danach) — beide teilen sich denselben Klick-Zustand (showTimer).
function TimerBadge({ busy, elapsedMs, finalMs, expanded, onToggle }) {
  if (!busy && finalMs === null) return null;
  const ms = busy ? elapsedMs : finalMs;
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-1 text-[11px] sm-text-ink-60 hover:text-black sm-font-label uppercase tracking-wide font-semibold"
      title={busy ? 'Laufzeit anzeigen' : 'Dauer der letzten Auswertung anzeigen'}
      type="button"
    >
      <Clock size={12} className={busy ? 'animate-pulse' : ''} />
      {expanded && <span className="sm-font-mono normal-case tracking-normal">{formatDuration(ms)}</span>}
    </button>
  );
}

function normalizeMeta(raw, imageCount) {
  const knownCategories = Object.keys(CATEGORIES);
  const meta = raw && typeof raw === 'object' ? raw : {};
  const validIndex = (v) => (Number.isInteger(v) && v >= 0 && v < imageCount ? v : null);
  // Platzhalter-Antworten ("nicht erkennbar", "unbekannt", …) nicht ins Formular übernehmen
  const cleanText = (v) => {
    if (typeof v !== 'string') return '';
    const t = v.trim();
    return /^(nicht erkennbar|nicht lesbar|unbekannt|keine angabe|n\/?a|null|none|[-–—]*)$/i.test(t) ? '' : t;
  };
  return {
    marke: cleanText(meta.marke),
    produktname: cleanText(meta.produktname),
    kategorie: knownCategories.includes(meta.kategorie) ? meta.kategorie : null,
    material: cleanText(meta.material),
    produktBildIndex: validIndex(meta.produktBildIndex),
    tabellenBildIndex: validIndex(meta.tabellenBildIndex)
  };
}

export default function ImageImport({ images, onChange, settings, storageMode, category, onApplyProposal }) {
  const fileInputRef = useRef(null);
  const [busyText, setBusyText] = useState('');
  const [error, setError] = useState('');
  const [proposal, setProposal] = useState(null);
  const [dismissedFlags, setDismissedFlags] = useState([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [finalMs, setFinalMs] = useState(null);
  const [showTimer, setShowTimer] = useState(false);
  const startTimeRef = useRef(null);

  const busy = busyText !== '';
  const isLocalMode = storageMode !== 'sqlite';

  // Tickt nur während eines laufenden KI-Durchlaufs; React räumt das Interval
  // automatisch auf, sobald `busy` false wird oder die Komponente unmountet.
  useEffect(() => {
    if (!busy) return undefined;
    const tick = () => setElapsedMs(Date.now() - startTimeRef.current);
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [busy]);
  const visionModel = settings.provider === 'ollama'
    ? (settings.ollamaVisionModel || DEFAULT_OLLAMA_VISION_MODEL)
    : (settings.apiModel || settings.provider);

  const addFiles = async (fileList) => {
    setError('');
    try {
      const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
      if (files.length === 0) return;
      const added = [];
      for (const file of files) {
        // Speicher-Variante verkleinert, Extraktions-Variante in Originalqualität
        added.push(await prepareImage(file, storageMode));
      }
      onChange([...images, ...added]);
    } catch (e) {
      console.error(e);
      setError('Bild konnte nicht gelesen werden. Bitte JPEG/PNG/WebP verwenden.');
    }
  };

  const removeImage = (id) => {
    onChange(images.filter(img => img.id !== id));
    setProposal(null);
  };

  // Aktualisiert die Tabelle im Vorschlag (Nutzer kann jede Zelle korrigieren)
  const updateProposalChart = (chart) => setProposal(p => (p ? { ...p, chart } : p));
  const updateProposalField = (field, value) => setProposal(p => (p ? { ...p, [field]: value } : p));

  // Verdoppelt alle Werte einer (flach gemessenen) Umfangs-Spalte
  const doubleColumn = (mi) => {
    setProposal(p => {
      if (!p?.chart) return p;
      const values = p.chart.values.map(row => row.map((v, i) => {
        if (i !== mi) return v;
        const num = parseFloat(String(v).replace(',', '.'));
        return Number.isNaN(num) ? v : String(Math.round(num * 2 * 10) / 10);
      }));
      return { ...p, chart: { ...p.chart, values } };
    });
  };

  const runExtraction = async () => {
    setError('');
    setProposal(null);
    setDismissedFlags([]);
    startTimeRef.current = Date.now();
    setElapsedMs(0);
    setFinalMs(null);
    try {
      setBusyText('Bereite Bilder vor…');
      const payloadImages = [];
      for (const img of images) {
        payloadImages.push(await imageToBase64(img));
      }

      // Stufe 1: Metadaten + welches Bild ist Produkt / Tabelle (best effort)
      setBusyText('Lese Produktdaten…');
      let meta = normalizeMeta(null, images.length);
      try {
        const metaPrompts = buildMetaPrompts(category, images.length);
        const rawMeta = await callLLM({
          settings,
          storageMode,
          systemPrompt: metaPrompts.systemPrompt,
          userPrompt: metaPrompts.userPrompt,
          images: payloadImages,
          endpoint: 'extract'
        });
        meta = normalizeMeta(rawMeta, images.length);
      } catch (e) {
        console.warn('Metadaten-Extraktion fehlgeschlagen, fahre mit Tabelle fort:', e);
      }

      // Stufe 2: Größentabelle isoliert — nur das Tabellenbild, wenn bekannt
      setBusyText('Lese Größentabelle…');
      const tableImages = meta.tabellenBildIndex !== null
        ? [payloadImages[meta.tabellenBildIndex]]
        : payloadImages;
      let chart = null;
      try {
        const tablePrompts = buildTablePrompts(tableImages.length === 1);
        const rawTable = await callLLM({
          settings,
          storageMode,
          systemPrompt: tablePrompts.systemPrompt,
          userPrompt: tablePrompts.userPrompt,
          images: tableImages,
          endpoint: 'extract'
        });
        chart = normalizeTable(rawTable);
      } catch (e) {
        console.warn('Tabellen-Extraktion fehlgeschlagen:', e);
      }

      if (!chart && !meta.marke && !meta.kategorie && !meta.produktname) {
        throw new Error('Keine verwertbaren Daten erkannt. Sind die Bilder scharf genug?');
      }

      setProposal({
        marke: meta.marke,
        produktname: meta.produktname,
        kategorie: meta.kategorie,
        material: meta.material,
        chart,
        produktBildIndex: meta.produktBildIndex,
        hinweise: chart ? '' : 'Keine Größentabelle erkannt — Werte bitte manuell eintragen.'
      });
    } catch (e) {
      console.error(e);
      let message = e.message || 'Unbekannter Fehler';
      if (/does not support images|image input|multimodal|vision/i.test(message)) {
        message = `Das Modell „${visionModel}“ kann keine Bilder verarbeiten. Wähle in den Einstellungen ein Vision-Modell (z. B. ${DEFAULT_OLLAMA_VISION_MODEL}).`;
      } else if (message.includes('JSON')) {
        message = 'Die KI hat kein sauberes Ergebnis geliefert — bitte erneut versuchen.';
      }
      setError(`Extraktion fehlgeschlagen: ${message}`);
    } finally {
      setFinalMs(Date.now() - startTimeRef.current);
      setBusyText('');
    }
  };

  const applyProposal = () => {
    if (!proposal) return;
    // Produktfoto markieren — der Parent nutzt es als Thumbnail.
    if (proposal.produktBildIndex !== null) {
      onChange(images.map((img, i) => ({
        ...img,
        kind: i === proposal.produktBildIndex ? 'produkt' : (img.kind === 'produkt' ? 'sonstiges' : img.kind)
      })));
    }
    onApplyProposal(proposal);
    setProposal(null);
  };

  return (
    <div className="border sm-border-graph rounded-sm sm-bg-card p-3.5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="sm-font-label uppercase tracking-wide text-xs sm-text-ink-60 font-semibold flex items-center gap-1.5">
          <ImagePlus size={13} className="sm-text-tape" /> Bilder & KI-Auswertung
        </div>
        <span className="text-[11px] sm-text-ink-40">
          Produktfoto + Größentabelle hochladen — die KI füllt die Werte aus.
        </span>
      </div>

      {/* Vorschau + Hinzufügen */}
      <div
        className="flex flex-wrap gap-2"
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
      >
        {images.map((img, i) => (
          <div key={img.id} className="relative w-20 h-20 border sm-border-graph rounded-sm overflow-hidden group bg-black/5">
            <img src={img.dataUrl || img.url} alt={`Bild ${i + 1}`} className="w-full h-full object-cover" />
            {img.kind === 'produkt' && (
              <span className="absolute bottom-0 left-0 right-0 bg-[#C9971F] text-white text-[9px] text-center font-semibold uppercase tracking-wide py-0.5">
                Titelbild
              </span>
            )}
            <button
              onClick={() => removeImage(img.id)}
              className="absolute top-0.5 right-0.5 bg-black/60 hover:bg-[#A8412F] text-white rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Bild entfernen"
              type="button"
            >
              <X size={11} />
            </button>
          </div>
        ))}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-20 h-20 border border-dashed sm-border-graph rounded-sm flex flex-col items-center justify-center gap-1 text-[10px] sm-text-ink-40 hover:border-[#C9971F] hover:text-[#C9971F] transition-colors"
          type="button"
        >
          <ImagePlus size={18} />
          Hinzufügen
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      {isLocalMode && images.length >= 2 && (
        <div className="text-[11px] sm-warn-box border rounded p-2">
          Browser-Speicher-Modus: Bilder werden komprimiert im localStorage abgelegt (~5 MB Limit).
          Für viele Fotos den lokalen Server starten (SQLite-Modus).
        </div>
      )}

      {/* KI-Auswertung */}
      {images.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={runExtraction}
            disabled={busy}
            className="sm-btn-primary flex items-center gap-2 text-xs"
            type="button"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {busy ? busyText : 'Mit KI auswerten'}
          </button>
          <TimerBadge busy={busy} elapsedMs={elapsedMs} finalMs={finalMs} expanded={showTimer} onToggle={() => setShowTimer(s => !s)} />
          <span className="text-[11px] sm-text-ink-60">
            Modell: <span className="font-semibold text-black uppercase">{visionModel}</span>
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-xs text-[#A8412F] bg-[#A8412F]/10 border border-[#A8412F]/20 p-2.5 rounded">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Vorschlags-Panel: editierbar, nichts wird ohne Bestätigung übernommen */}
      {proposal && (() => {
        const halfFlags = proposal.chart
          ? flagHalfMeasurements(proposal.chart).filter(mi => !dismissedFlags.includes(proposal.chart.measurements[mi]))
          : [];
        return (
          <div className="border border-[#C9971F]/50 bg-[#C9971F]/5 rounded-sm p-3 space-y-3 animate-scale-up">
            <div className="sm-font-label uppercase tracking-wide text-xs font-semibold sm-text-warn flex items-center gap-1.5">
              <Sparkles size={13} /> KI-Vorschlag — prüfen & bei Bedarf korrigieren
            </div>

            {/* Editierbare Metadaten */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="block">
                <span className="block text-[10px] sm-font-label uppercase tracking-wide sm-text-ink-60 mb-0.5">Marke</span>
                <input value={proposal.marke} onChange={e => updateProposalField('marke', e.target.value)} className="sm-input text-xs py-1.5" />
              </label>
              <label className="block">
                <span className="block text-[10px] sm-font-label uppercase tracking-wide sm-text-ink-60 mb-0.5">Produktname</span>
                <input value={proposal.produktname} onChange={e => updateProposalField('produktname', e.target.value)} className="sm-input text-xs py-1.5" />
              </label>
              <label className="block">
                <span className="block text-[10px] sm-font-label uppercase tracking-wide sm-text-ink-60 mb-0.5">Kategorie</span>
                <select value={proposal.kategorie || ''} onChange={e => updateProposalField('kategorie', e.target.value || null)} className="sm-input text-xs py-1.5">
                  <option value="">— wählen —</option>
                  {Object.keys(CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="block text-[10px] sm-font-label uppercase tracking-wide sm-text-ink-60 mb-0.5">Material</span>
                <input value={proposal.material} onChange={e => updateProposalField('material', e.target.value)} className="sm-input text-xs py-1.5" />
              </label>
            </div>

            {/* Halbe-Umfänge-Warnung */}
            {halfFlags.map(mi => (
              <div key={mi} className="flex items-start gap-2 text-[11px] sm-warn-box border rounded p-2">
                <TriangleAlert size={14} className="mt-0.5 shrink-0 sm-text-warn" />
                <div className="flex-1">
                  <span className="font-semibold">»{proposal.chart.measurements[mi]}«</span> sieht flach gemessen aus
                  (halber Umfang). Viele Tabellen geben z. B. 56 statt 112 an.
                  <div className="flex items-center gap-2 mt-1.5">
                    <button onClick={() => doubleColumn(mi)} className="sm-btn-primary text-[11px] py-1 px-2" type="button">
                      ×2 umrechnen
                    </button>
                    <button
                      onClick={() => setDismissedFlags(d => [...d, proposal.chart.measurements[mi]])}
                      className="sm-btn-ghost text-[11px] py-1 px-2"
                      type="button"
                    >
                      Ignorieren
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {/* Editierbare Größentabelle */}
            {proposal.chart ? (
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="block text-[10px] sm-font-label uppercase tracking-wide sm-text-ink-60">Größentabelle (jede Zelle editierbar)</span>
                  <TimerBadge busy={busy} elapsedMs={elapsedMs} finalMs={finalMs} expanded={showTimer} onToggle={() => setShowTimer(s => !s)} />
                </div>
                <SizeChartEditor chart={proposal.chart} onChange={updateProposalChart} />
              </div>
            ) : (
              <div className="text-[11px] sm-text-ink-60 italic">Keine Größentabelle erkannt — Werte unten manuell eintragen.</div>
            )}

            {proposal.hinweise && (
              <div className="text-[11px] sm-text-ink-60 italic flex items-start gap-1">
                <Lightbulb size={12} className="sm-text-tape mt-0.5 shrink-0" />
                <span>{proposal.hinweise}</span>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <button onClick={applyProposal} className="sm-btn-primary flex items-center gap-1.5 text-xs" type="button">
                <Check size={13} /> Werte übernehmen
              </button>
              <button onClick={() => setProposal(null)} className="sm-btn-ghost flex items-center gap-1.5 text-xs" type="button">
                <Trash2 size={13} /> Verwerfen
              </button>
              <span className="text-[10px] sm-text-ink-40">Gespeichert wird erst nach deiner Bestätigung unten.</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
