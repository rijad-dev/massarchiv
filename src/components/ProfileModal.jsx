import React, { useState } from 'react';
import { X, User, Plus, Trash2, Sparkles, Loader2, AlertCircle, Check } from 'lucide-react';
import { uid, chartToPlain } from '../utils/helpers';
import { callLLM } from '../utils/llm';

export const EMPTY_PROFILE = {
  groesse: '',
  gewicht: '',
  kfa: '',
  brustumfang: '',
  taillenumfang: '',
  hueftumfang: '',
  schulterbreite: '',
  aermellaenge: '',
  beininnenlaenge: '',
  schuhgroesse: '',
  passformPraeferenz: '',
  notizen: '',
  custom: []
};

// Deutsche Labels — auch für den Analyse-Prompt (siehe profileToPromptLines)
export const PROFILE_FIELDS = [
  { key: 'groesse', label: 'Körpergröße', unit: 'cm' },
  { key: 'gewicht', label: 'Gewicht', unit: 'kg' },
  { key: 'kfa', label: 'Körperfettanteil (KFA)', unit: '%' },
  { key: 'brustumfang', label: 'Brustumfang', unit: 'cm' },
  { key: 'taillenumfang', label: 'Taillenumfang', unit: 'cm' },
  { key: 'hueftumfang', label: 'Hüftumfang', unit: 'cm' },
  { key: 'schulterbreite', label: 'Schulterbreite', unit: 'cm' },
  { key: 'aermellaenge', label: 'Ärmellänge', unit: 'cm' },
  { key: 'beininnenlaenge', label: 'Beininnenlänge', unit: 'cm' },
  { key: 'schuhgroesse', label: 'Schuhgröße (EU)', unit: '' },
];

const FIT_PREFS = ['', 'Eher slim', 'Regular', 'Eher oversized'];

// Nur Umfänge/Längen sind aus Kleidungsmaßen ableitbar — Körpergröße, Gewicht,
// KFA und Schuhgröße haben in Größentabellen kein Signal.
const INFERABLE_FIELDS = ['brustumfang', 'taillenumfang', 'hueftumfang', 'schulterbreite', 'aermellaenge', 'beininnenlaenge'];

const MAX_WARDROBE_ITEMS_FOR_INFERENCE = 40;

// Zuverlässigstes Passform-Signal zuerst. "Ungetragen / unsicher" wird nicht
// priorisiert, sondern (in prioritizeWardrobeForInference) komplett ausgeschlossen.
const FIT_PRIORITY = {
  'Perfekte Passform': 0,
  'Etwas eng': 1,
  'Etwas locker': 1,
  'Zu eng': 2,
  'Zu weit': 2,
};

function prioritizeWardrobeForInference(wardrobe) {
  return wardrobe
    .filter(g => g.fit && g.fit !== 'Ungetragen / unsicher' && g.chart?.sizes?.some(s => s && s.trim()))
    .sort((a, b) => (FIT_PRIORITY[a.fit] ?? 3) - (FIT_PRIORITY[b.fit] ?? 3));
}

function buildProfileInferencePrompts(wardrobeForPrompt, usedCount, totalCount) {
  const systemPrompt =
    'Du bist ein Experte für Körpermaße und Passform von Kleidung. Du bekommst die Garderobe eines ' +
    'Nutzers: Kleidungsstücke mit ihrer Größentabelle (Herstellermaßen in cm je Größe), der vom Nutzer ' +
    'tatsächlich besessenen Größe und seiner ehrlichen Rückmeldung, wie das Teil ihm passt. Deine ' +
    'Aufgabe: leite daraus die wahrscheinlichen KÖRPERMASSE des Nutzers ab — NICHT die Kleidungsmaße. ' +
    'Nimm je Kleidungsstück den Wert der besessenen Größe aus der Größentabelle und passe ihn anhand ' +
    'der Passform an: "Perfekte Passform" → Körpermaß ≈ Kleidungsmaß minus übliche Bewegungszugabe ' +
    '(Ease) je nach Kategorie/Material (z. B. Baumwoll-Oberteile ca. 4-8 cm Ease am Brustumfang, ' +
    'Stretch-Mixe weniger, Hosenbund oft nur 1-3 cm). "Etwas eng"/"Zu eng" → das Körpermaß ist GRÖSSER ' +
    'als das Kleidungsmaß der besessenen Größe. "Etwas locker"/"Zu weit" → das Körpermaß ist KLEINER als ' +
    'das Kleidungsmaß. Kombiniere alle passenden Referenzstücke pro Körperregion zu einer plausiblen ' +
    'Schätzung; widersprechen sich Referenzen, wähle die Mitte und nenne den Konflikt in "hinweise". ' +
    'Schätze AUSSCHLIESSLICH diese sechs Felder (cm): brustumfang, taillenumfang, hueftumfang, ' +
    'schulterbreite, aermellaenge, beininnenlaenge. Schätze NIEMALS Körpergröße, Gewicht, ' +
    'Körperfettanteil oder Schuhgröße — dafür gibt es in Kleidungsmaßen kein verlässliches Signal, lass ' +
    'diese Felder immer weg. Gib für ein Feld nur einen Wert zurück, wenn mindestens ein Referenzstück ' +
    'dafür ein brauchbares Maß liefert, sonst lass es als leeren String. Antworte AUSSCHLIESSLICH mit ' +
    'validem JSON ohne Markdown-Codeblock, exakt in diesem Format: {"brustumfang": string, ' +
    '"taillenumfang": string, "hueftumfang": string, "schulterbreite": string, "aermellaenge": string, ' +
    '"beininnenlaenge": string, "confidence": "hoch" oder "mittel" oder "niedrig", "hinweise": string}. ' +
    'Werte als Zahlen-Strings ohne Einheit (Dezimalpunkt statt Komma).';

  const userPrompt =
    `GARDEROBE DES NUTZERS (${usedCount} von ${totalCount} Kleidungsstücken mit auswertbarer ` +
    'Passform-Rückmeldung, priorisiert nach verlässlichster Passform-Angabe zuerst):\n' +
    JSON.stringify(wardrobeForPrompt, null, 2) +
    '\n\nErmittle daraus die wahrscheinlichen Körpermaße des Nutzers für Brustumfang, Taillenumfang, ' +
    'Hüftumfang, Schulterbreite, Ärmellänge und Beininnenlänge.';

  return { systemPrompt, userPrompt };
}

function normalizeInference(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {};
  const cleanNum = (v) => {
    const s = String(v ?? '').trim().replace(',', '.');
    return /^\d+(\.\d+)?$/.test(s) ? s : '';
  };
  const values = {};
  for (const key of INFERABLE_FIELDS) values[key] = cleanNum(obj[key]);
  return {
    values,
    confidence: ['hoch', 'mittel', 'niedrig'].includes(obj.confidence) ? obj.confidence : null,
    hinweise: typeof obj.hinweise === 'string' ? obj.hinweise.trim() : ''
  };
}

// Nicht-leere Profilwerte als Zeilen für den Analyse-Prompt
export function profileToPromptLines(profile) {
  if (!profile) return [];
  const lines = [];
  for (const f of PROFILE_FIELDS) {
    const v = String(profile[f.key] ?? '').trim();
    if (v) lines.push(`${f.label}: ${v}${f.unit ? ' ' + f.unit : ''}`);
  }
  if (profile.passformPraeferenz) lines.push(`Bevorzugte Passform: ${profile.passformPraeferenz}`);
  for (const c of profile.custom || []) {
    const label = String(c?.label ?? '').trim();
    const value = String(c?.value ?? '').trim();
    if (label && value) lines.push(`${label}: ${value}`);
  }
  const note = String(profile.notizen ?? '').trim();
  if (note) lines.push(`Notizen: ${note}`);
  return lines;
}

export default function ProfileModal({ profile, onSave, onCancel, wardrobe, settings, storageMode }) {
  const [form, setForm] = useState({ ...EMPTY_PROFILE, ...(profile || {}) });
  const [profileInferenceBusy, setProfileInferenceBusy] = useState(false);
  const [profileInferenceError, setProfileInferenceError] = useState('');
  const [profileInferenceProposal, setProfileInferenceProposal] = useState(null);

  const setField = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const updateInferenceField = (key, value) =>
    setProfileInferenceProposal(p => (p ? { ...p, values: { ...p.values, [key]: value } } : p));

  const runProfileInference = async () => {
    setProfileInferenceError('');
    setProfileInferenceProposal(null);
    setProfileInferenceBusy(true);
    try {
      const prioritized = prioritizeWardrobeForInference(wardrobe || []);
      if (prioritized.length === 0) {
        throw new Error('Keine Kleidungsstücke mit auswertbarer Passform-Rückmeldung in der Garderobe.');
      }
      const used = prioritized.slice(0, MAX_WARDROBE_ITEMS_FOR_INFERENCE);
      const wardrobeForPrompt = used.map(g => ({
        marke: g.brand,
        produkt: g.name,
        kategorie: g.category,
        besessene_groesse: g.ownedSize,
        material: g.material,
        passform: g.fit,
        passform_notiz: g.fitNote,
        groessentabelle_cm: chartToPlain(g.chart),
      }));
      const { systemPrompt, userPrompt } = buildProfileInferencePrompts(wardrobeForPrompt, used.length, wardrobe.length);
      const raw = await callLLM({ settings, storageMode, systemPrompt, userPrompt, endpoint: 'analyze' });
      const parsed = normalizeInference(raw);
      if (!INFERABLE_FIELDS.some(k => parsed.values[k])) {
        throw new Error('Die KI konnte keine verwertbaren Maße ableiten.');
      }
      setProfileInferenceProposal({ ...parsed, usedCount: used.length, totalCount: wardrobe.length });
    } catch (e) {
      console.error(e);
      setProfileInferenceError(`Ermittlung fehlgeschlagen: ${e.message || 'Unbekannter Fehler'}`);
    } finally {
      setProfileInferenceBusy(false);
    }
  };

  const applyProfileInference = () => {
    if (!profileInferenceProposal) return;
    setForm(f => {
      const next = { ...f };
      for (const key of INFERABLE_FIELDS) {
        const v = String(profileInferenceProposal.values[key] ?? '').trim();
        if (v) next[key] = v;
      }
      return next;
    });
    setProfileInferenceProposal(null);
  };

  const addCustom = () => setForm(f => ({ ...f, custom: [...(f.custom || []), { id: uid(), label: '', value: '' }] }));
  const updateCustom = (id, patch) => setForm(f => ({
    ...f,
    custom: (f.custom || []).map(c => (c.id === id ? { ...c, ...patch } : c))
  }));
  const removeCustom = (id) => setForm(f => ({ ...f, custom: (f.custom || []).filter(c => c.id !== id) }));

  const handleSave = () => {
    const cleaned = {
      ...form,
      custom: (form.custom || []).filter(c => String(c.label).trim() || String(c.value).trim())
    };
    onSave(cleaned);
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 z-50 animate-fade-in"
      style={{ background: 'rgba(34,31,26,0.4)' }}
      onClick={onCancel}
    >
      <div
        className="sm-bg-paper max-w-lg w-full rounded-sm shadow-xl sm-border-graph border overflow-hidden animate-scale-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b sm-border-graph bg-black/[0.02]">
          <h3 className="sm-font-label uppercase tracking-wide text-sm sm-text-ink flex items-center gap-2 font-semibold">
            <User size={16} className="sm-text-tape" /> Mein Steckbrief
          </h3>
          <button onClick={onCancel} className="sm-icon-btn p-1 hover:bg-black/5 rounded" type="button"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <p className="text-xs sm-text-ink-60 leading-relaxed">
            Alle Angaben sind optional und bleiben lokal gespeichert. Die KI nutzt sie bei
            „Neues Produkt prüfen" für genauere Größenempfehlungen.
          </p>

          <div className="border sm-border-graph rounded-sm sm-bg-card p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs sm-text-ink-60 leading-relaxed max-w-sm">
                Lässt die KI aus Größentabellen und Passform-Rückmeldungen deiner Garderobe Brustumfang,
                Taille, Hüfte, Schulterbreite, Ärmel- und Beininnenlänge schätzen.
              </div>
              <button
                onClick={runProfileInference}
                disabled={profileInferenceBusy || !wardrobe || wardrobe.length === 0}
                className="sm-btn-primary flex items-center gap-2 text-xs shrink-0"
                title={!wardrobe || wardrobe.length === 0 ? 'Noch keine Kleidungsstücke in der Garderobe' : undefined}
                type="button"
              >
                {profileInferenceBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {profileInferenceBusy ? 'Ermittle Maße…' : 'Aus Garderobe ermitteln'}
              </button>
            </div>
            {(!wardrobe || wardrobe.length === 0) && (
              <div className="text-[11px] sm-text-ink-40 italic">Noch keine Kleidungsstücke in der Garderobe.</div>
            )}
            {profileInferenceError && (
              <div className="flex items-start gap-2 text-xs text-[#A8412F] bg-[#A8412F]/10 border border-[#A8412F]/20 p-2 rounded">
                <AlertCircle size={14} className="mt-0.5 shrink-0" /><span>{profileInferenceError}</span>
              </div>
            )}
            {profileInferenceProposal && (
              <div className="border border-[#C9971F]/50 bg-[#C9971F]/5 rounded-sm p-3 space-y-2.5 animate-scale-up">
                <div className="sm-font-label uppercase tracking-wide text-xs font-semibold text-yellow-900 flex items-center gap-1.5">
                  <Sparkles size={13} /> KI-Schätzung — prüfen & bei Bedarf korrigieren
                </div>
                <div className="text-[11px] sm-text-ink-60">
                  {profileInferenceProposal.usedCount < profileInferenceProposal.totalCount && (
                    <>{profileInferenceProposal.usedCount} von {profileInferenceProposal.totalCount} Kleidungsstücken verwendet (priorisiert: perfekte Passform zuerst). </>
                  )}
                  {profileInferenceProposal.confidence && (
                    <>Konfidenz: <span className="font-semibold">{profileInferenceProposal.confidence}</span>.</>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {INFERABLE_FIELDS.map(key => {
                    const f = PROFILE_FIELDS.find(pf => pf.key === key);
                    return (
                      <label key={key} className="block">
                        <span className="block text-[10px] sm-font-label uppercase tracking-wide sm-text-ink-60 mb-0.5">{f.label}</span>
                        <input
                          value={profileInferenceProposal.values[key]}
                          onChange={e => updateInferenceField(key, e.target.value)}
                          inputMode="decimal"
                          className="sm-input text-xs py-1.5"
                        />
                      </label>
                    );
                  })}
                </div>
                {profileInferenceProposal.hinweise && (
                  <div className="text-[11px] sm-text-ink-60 italic">💡 {profileInferenceProposal.hinweise}</div>
                )}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <button onClick={applyProfileInference} className="sm-btn-primary flex items-center gap-1.5 text-xs" type="button">
                    <Check size={13} /> Übernehmen
                  </button>
                  <button onClick={() => setProfileInferenceProposal(null)} className="sm-btn-ghost flex items-center gap-1.5 text-xs" type="button">
                    <Trash2 size={13} /> Verwerfen
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PROFILE_FIELDS.map(f => (
              <label key={f.key} className="block">
                <span className="block sm-font-label uppercase tracking-wide text-xs sm-text-ink-60 mb-1">
                  {f.label}{f.unit ? ` (${f.unit})` : ''}
                </span>
                <input
                  value={form[f.key] || ''}
                  onChange={e => setField(f.key, e.target.value)}
                  inputMode="decimal"
                  className="sm-input"
                />
              </label>
            ))}
            <label className="block">
              <span className="block sm-font-label uppercase tracking-wide text-xs sm-text-ink-60 mb-1">Bevorzugte Passform</span>
              <select
                value={form.passformPraeferenz || ''}
                onChange={e => setField('passformPraeferenz', e.target.value)}
                className="sm-input"
              >
                {FIT_PREFS.map(p => <option key={p} value={p}>{p || '— keine Angabe —'}</option>)}
              </select>
            </label>
          </div>

          {/* Frei anpassbare Zusatzfelder */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="sm-font-label uppercase tracking-wide text-xs sm-text-ink-60 font-semibold">Eigene Felder</span>
              <button
                onClick={addCustom}
                className="flex items-center gap-1 text-xs sm-text-tape hover:text-black px-2 py-1 border border-dashed sm-border-graph rounded transition-all sm-font-label uppercase tracking-wide"
                type="button"
              >
                <Plus size={12} /> Feld hinzufügen
              </button>
            </div>
            {(form.custom || []).map(c => (
              <div key={c.id} className="flex items-center gap-2">
                <input
                  value={c.label}
                  onChange={e => updateCustom(c.id, { label: e.target.value })}
                  placeholder="z.B. Halsumfang"
                  className="sm-input flex-1"
                />
                <input
                  value={c.value}
                  onChange={e => updateCustom(c.id, { value: e.target.value })}
                  placeholder="z.B. 39 cm"
                  className="sm-input flex-1"
                />
                <button onClick={() => removeCustom(c.id)} className="sm-icon-btn-danger p-1.5 hover:bg-[#A8412F]/10 rounded shrink-0" type="button">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <label className="block">
            <span className="block sm-font-label uppercase tracking-wide text-xs sm-text-ink-60 mb-1">Notizen (Passform-Eigenheiten etc.)</span>
            <textarea
              value={form.notizen || ''}
              onChange={e => setField('notizen', e.target.value)}
              rows={3}
              placeholder="z.B. breite Schultern, lange Arme — Ärmel oft zu kurz"
              className="sm-input resize-y"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t sm-border-graph sm-bg-card bg-black/[0.02]">
          <button onClick={onCancel} className="sm-btn-ghost" type="button">Abbrechen</button>
          <button onClick={handleSave} className="sm-btn-primary" type="button">Speichern</button>
        </div>
      </div>
    </div>
  );
}
