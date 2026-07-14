import { describe, it, expect } from 'vitest';
import {
  uid,
  emptyChart,
  matchesQuery,
  linkLabel,
  normalizeUrl,
  chartToPlain,
  CATEGORIES,
  DEFAULT_SIZES,
} from '../src/utils/helpers.js';

describe('uid', () => {
  it('liefert kurze, unterschiedliche IDs', () => {
    const a = uid();
    const b = uid();
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });
});

describe('emptyChart', () => {
  it('nutzt die Maße der Kategorie und die Standard-Größen', () => {
    const chart = emptyChart('Shorts');
    expect(chart.measurements).toEqual(CATEGORIES['Shorts']);
    expect(chart.sizes).toEqual(DEFAULT_SIZES);
    expect(chart.values).toHaveLength(DEFAULT_SIZES.length);
    expect(chart.values[0]).toHaveLength(CATEGORIES['Shorts'].length);
    expect(chart.values.flat().every(v => v === '')).toBe(true);
  });

  it('nutzt kategorie-spezifische Größen (Schuhe)', () => {
    const chart = emptyChart('Schuhe');
    expect(chart.sizes).toEqual(['41', '42', '43', '44']);
  });

  it('fällt bei unbekannter Kategorie auf Sonstiges zurück', () => {
    const chart = emptyChart('Gibt es nicht');
    expect(chart.measurements).toEqual(CATEGORIES['Sonstiges']);
  });
});

describe('matchesQuery', () => {
  it('leere Suche trifft immer', () => {
    expect(matchesQuery('', 'Zara')).toBe(true);
    expect(matchesQuery(null, 'Zara')).toBe(true);
  });

  it('sucht case-insensitiv als Substring', () => {
    expect(matchesQuery('zar', 'Zara', 'Shorts')).toBe(true);
    expect(matchesQuery('SHORTS', 'Zara', 'Shorts')).toBe(true);
    expect(matchesQuery('nike', 'Zara', 'Shorts')).toBe(false);
  });

  it('durchsucht auch String-Arrays und ignoriert null-Felder', () => {
    expect(matchesQuery('example', null, ['https://example.com'])).toBe(true);
    expect(matchesQuery('x', null, undefined, [])).toBe(false);
  });
});

describe('linkLabel', () => {
  it('zeigt nur den Hostnamen ohne www', () => {
    expect(linkLabel('https://www.zalando.de/shorts-123')).toBe('zalando.de');
  });

  it('fällt bei ungültiger URL auf den Rohtext zurück', () => {
    expect(linkLabel('kein link')).toBe('kein link');
  });
});

describe('normalizeUrl', () => {
  it('ergänzt fehlendes Protokoll', () => {
    expect(normalizeUrl('zalando.de/x')).toBe('https://zalando.de/x');
  });

  it('lässt vorhandenes Protokoll unverändert', () => {
    expect(normalizeUrl('http://example.com')).toBe('http://example.com');
    expect(normalizeUrl('HTTPS://example.com')).toBe('HTTPS://example.com');
  });

  it('leerer Input bleibt leer', () => {
    expect(normalizeUrl('')).toBe('');
    expect(normalizeUrl(null)).toBe('');
  });
});

describe('chartToPlain', () => {
  it('wandelt das Chart-Modell in {Größe: {Maß: Zahl}} um', () => {
    const chart = {
      measurements: ['Bund', 'Länge'],
      sizes: ['M', 'L'],
      values: [
        ['80', '100'],
        ['84', ''],
      ],
    };
    expect(chartToPlain(chart)).toEqual({
      M: { Bund: 80, 'Länge': 100 },
      L: { Bund: 84 },
    });
  });

  it('überspringt leere Größen-Zeilen', () => {
    const chart = {
      measurements: ['Bund'],
      sizes: ['M', '', '  '],
      values: [['80'], ['84'], ['88']],
    };
    expect(Object.keys(chartToPlain(chart))).toEqual(['M']);
  });
});
