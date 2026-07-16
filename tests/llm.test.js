import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseRawJSON, extractProviderText, callLLM } from '../src/utils/llm.js';

describe('parseRawJSON', () => {
  it('parst sauberes JSON', () => {
    expect(parseRawJSON('{"a": 1}')).toEqual({ a: 1 });
  });

  it('entfernt Markdown-Codeblöcke', () => {
    expect(parseRawJSON('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it('extrahiert das erste balancierte Objekt aus umgebendem Text', () => {
    expect(parseRawJSON('Hier das Ergebnis: {"groesse": "L"} — viel Erfolg!')).toEqual({ groesse: 'L' });
  });

  it('übersteht überzählige Schlusszeichen nach dem Objekt', () => {
    expect(parseRawJSON('{"a": {"b": 2}}}')).toEqual({ a: { b: 2 } });
  });

  it('ignoriert geschweifte Klammern innerhalb von Strings', () => {
    expect(parseRawJSON('{"text": "ein } zeichen"} nachlauf')).toEqual({ text: 'ein } zeichen' });
  });

  it('wirft bei Text ohne JSON', () => {
    expect(() => parseRawJSON('kein json hier')).toThrow('Keine JSON-Antwort erkennbar');
  });

  it('wirft bei unvollständigem JSON', () => {
    expect(() => parseRawJSON('{"a": 1')).toThrow('Unvollständige JSON-Antwort');
  });
});

describe('extractProviderText', () => {
  it('liest die Antwortformate aller vier Provider', () => {
    expect(extractProviderText('ollama', { message: { content: 'x' } })).toBe('x');
    expect(
      extractProviderText('gemini', { candidates: [{ content: { parts: [{ text: 'x' }] } }] })
    ).toBe('x');
    expect(extractProviderText('openai', { choices: [{ message: { content: 'x' } }] })).toBe('x');
    expect(
      extractProviderText('anthropic', { content: [{ type: 'text', text: 'x' }] })
    ).toBe('x');
  });

  it('fällt bei leeren Antworten auf "{}" zurück', () => {
    expect(extractProviderText('ollama', {})).toBe('{}');
    expect(extractProviderText('openai', { choices: [] })).toBe('{}');
  });

  it('stringifiziert unbekannte Provider-Antworten', () => {
    expect(extractProviderText('sonstwas', { a: 1 })).toBe('{"a":1}');
    expect(extractProviderText('sonstwas', 'roh')).toBe('roh');
  });
});

describe('Cloud-Timeout', () => {
  afterEach(() => vi.unstubAllGlobals());

  // Antwortformen der drei Cloud-Provider, jeweils mit gültigem JSON-Payload
  const shaped = {
    gemini: { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] },
    openai: { choices: [{ message: { content: '{"ok":true}' } }] },
    anthropic: { content: [{ type: 'text', text: '{"ok":true}' }] }
  };

  for (const provider of ['gemini', 'openai', 'anthropic']) {
    it(`bricht hängende ${provider}-Requests per AbortSignal ab`, async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => shaped[provider] });
      vi.stubGlobal('fetch', fetchMock);

      const result = await callLLM({
        settings: { provider, apiKey: 'test-key' },
        storageMode: 'local',
        systemPrompt: 's',
        userPrompt: 'u'
      });

      expect(result).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    });
  }
});
