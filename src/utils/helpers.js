// Zentrale Ollama-Modell-Defaults — einzige Quelle für App-Einstellungen,
// SettingsModal-Fallbacks und LLM-Client (vorher an vier Stellen inkonsistent).
export const DEFAULT_OLLAMA_TEXT_MODEL = 'qwen2.5vl:7b';
export const DEFAULT_OLLAMA_VISION_MODEL = 'qwen2.5vl:7b';

export const CATEGORIES = {
  'Shorts': ['Bund', 'Hüfte', 'Schrittlänge'],
  'Hose / Jeans': ['Bund', 'Hüfte', 'Schrittlänge', 'Beininnenlänge'],
  'T-Shirt': ['Brustumfang', 'Länge', 'Schulterbreite'],
  'Longsleeve': ['Brustumfang', 'Länge', 'Schulterbreite', 'Ärmellänge'],
  'Hoodie / Pullover': ['Brustumfang', 'Länge', 'Schulterbreite', 'Ärmellänge'],
  'Jacke': ['Brustumfang', 'Länge', 'Schulterbreite', 'Ärmellänge'],
  'Schuhe': ['Innensohlenlänge', 'Außenlänge'],
  'Accessoires': ['Breite', 'Länge'],
  'Sonstiges': ['Maß A', 'Maß B', 'Maß C'],
};

export const DEFAULT_SIZES_BY_CATEGORY = {
  'Schuhe': ['41', '42', '43', '44'],
  'Accessoires': ['One Size'],
};

export const FIT_OPTIONS = [
  'Perfekte Passform',
  'Etwas eng',
  'Zu eng',
  'Etwas locker',
  'Zu weit',
  'Ungetragen / unsicher'
];

export const DEFAULT_SIZES = ['S', 'M', 'L', 'XL'];

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function emptyChart(category) {
  const measurements = [...(CATEGORIES[category] || CATEGORIES['Sonstiges'])];
  const sizes = [...(DEFAULT_SIZES_BY_CATEGORY[category] || DEFAULT_SIZES)];
  const values = sizes.map(() => measurements.map(() => ''));
  return { measurements, sizes, values };
}

// Case-insensitive Substring-Suche über beliebige Felder (Strings + String-Arrays).
export function matchesQuery(query, ...fields) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  return fields.some(f => {
    if (Array.isArray(f)) return f.some(v => String(v ?? '').toLowerCase().includes(q));
    return String(f ?? '').toLowerCase().includes(q);
  });
}

// Zeigt bei einer URL nur den Hostnamen an (kürzer, lesbarer); Fallback = Rohtext.
export function linkLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// Ergänzt fehlendes Protokoll, damit target=_blank-Links funktionieren.
export function normalizeUrl(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

// Löst einen Browser-Download für ein JSON-Objekt aus (Backup-Export).
export function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function chartToPlain(chart) {
  const rows = {};
  chart.sizes.forEach((s, si) => {
    if (!s || !s.trim()) return;
    const measures = {};
    chart.measurements.forEach((m, mi) => {
      const v = chart.values[si] ? chart.values[si][mi] : '';
      if (v !== '' && v !== undefined && v !== null) {
        measures[m] = Number(v);
      }
    });
    rows[s] = measures;
  });
  return rows;
}
