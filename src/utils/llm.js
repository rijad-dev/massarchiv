// Zentraler LLM-Client für Analyse (Text) und Extraktion (Vision).
// Routet je nach Speicher-Modus über den Express-Proxy (/api/analyze, /api/extract)
// oder direkt aus dem Browser (localStorage-/Dateimodus).

import { api } from './api';
import { DEFAULT_OLLAMA_TEXT_MODEL, DEFAULT_OLLAMA_VISION_MODEL } from './helpers';

// Cloud-APIs antworten in Sekunden bis wenigen Minuten — hängende Verbindungen
// nach 120 s hart abbrechen. Lokales Ollama braucht mehr Luft (große
// Vision-Modelle laden minutenlang), analog zum 600-s-Agent im Server-Proxy.
const CLOUD_TIMEOUT_MS = 120_000;
const OLLAMA_TIMEOUT_MS = 600_000;

export function parseRawJSON(text) {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch { /* Reparaturversuch unten */ }

  // Lokale Modelle liefern gelegentlich Text vor/nach dem JSON oder ein
  // überzähliges Schlusszeichen — das erste balancierte Objekt extrahieren.
  const start = cleaned.indexOf('{');
  if (start === -1) throw new Error('Keine JSON-Antwort erkennbar');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = inString; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return JSON.parse(cleaned.slice(start, i + 1));
    }
  }
  throw new Error('Unvollständige JSON-Antwort');
}

export function extractProviderText(provider, data) {
  if (provider === 'ollama') return data.message?.content || '{}';
  if (provider === 'gemini') return data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  if (provider === 'openai') return data.choices?.[0]?.message?.content || '{}';
  if (provider === 'anthropic') return data.content?.find(b => b.type === 'text')?.text || '{}';
  return typeof data === 'string' ? data : JSON.stringify(data);
}

// images: [{ mimeType, data }] — data = Base64 ohne "data:"-Prefix
async function fetchClientSideLLM(settings, systemPrompt, userPrompt, images) {
  const {
    provider,
    ollamaUrl = 'http://localhost:11434',
    ollamaModel = DEFAULT_OLLAMA_TEXT_MODEL,
    ollamaVisionModel = DEFAULT_OLLAMA_VISION_MODEL,
    apiKey,
    apiModel,
    customBaseUrl
  } = settings;
  const hasImages = images.length > 0;

  if (provider === 'ollama') {
    const userMessage = { role: 'user', content: userPrompt };
    if (hasImages) userMessage.images = images.map(i => i.data);
    const payload = {
      model: hasImages ? ollamaVisionModel : ollamaModel,
      messages: [
        { role: 'system', content: systemPrompt },
        userMessage
      ],
      stream: false,
      format: 'json'
    };
    // Kontext begrenzen (sonst 262k-KV-Cache → CPU statt GPU) — gilt auch für
    // Text-Anfragen mit großem Garderoben-JSON (Größenanalyse, Steckbrief-Ermittlung).
    payload.options = { num_ctx: 16384 };
    if (hasImages) {
      // Thinking-Phase überspringen — Modelle ohne Thinking lehnen das ab,
      // dann einmal ohne "think" erneut versuchen. Nur für Vision validiert.
      payload.think = false;
    }
    const doRequest = () => fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS)
    });
    let response = await doRequest();
    if (!response.ok) {
      const errText = await response.text();
      if (payload.think === false && /think/i.test(errText)) {
        delete payload.think;
        response = await doRequest();
      }
      if (!response.ok) throw new Error(`Ollama Server returned status ${response.status}`);
    }
    return parseRawJSON(extractProviderText('ollama', await response.json()));
  }

  if (provider === 'gemini') {
    const model = apiModel || 'gemini-1.5-flash';
    const baseUrl = customBaseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    const parts = [{ text: `${systemPrompt}\n\nNutzer-Anfrage:\n${userPrompt}` }];
    images.forEach(i => parts.push({ inline_data: { mime_type: i.mimeType, data: i.data } }));
    const response = await fetch(`${baseUrl}/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: 'application/json' }
      }),
      signal: AbortSignal.timeout(CLOUD_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`Gemini Server returned status ${response.status}`);
    return parseRawJSON(extractProviderText('gemini', await response.json()));
  }

  if (provider === 'openai') {
    const model = apiModel || 'gpt-4o-mini';
    const baseUrl = customBaseUrl || 'https://api.openai.com/v1';
    const userContent = hasImages
      ? [
          { type: 'text', text: userPrompt },
          ...images.map(i => ({ type: 'image_url', image_url: { url: `data:${i.mimeType};base64,${i.data}` } }))
        ]
      : userPrompt;
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        response_format: { type: 'json_object' }
      }),
      signal: AbortSignal.timeout(CLOUD_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`OpenAI Server returned status ${response.status}`);
    return parseRawJSON(extractProviderText('openai', await response.json()));
  }

  if (provider === 'anthropic') {
    const model = apiModel || 'claude-3-5-sonnet-20241022';
    const baseUrl = customBaseUrl || 'https://api.anthropic.com/v1';
    const userContent = hasImages
      ? [
          ...images.map(i => ({ type: 'image', source: { type: 'base64', media_type: i.mimeType, data: i.data } })),
          { type: 'text', text: userPrompt }
        ]
      : userPrompt;
    const response = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }]
      }),
      signal: AbortSignal.timeout(CLOUD_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`Anthropic Server returned status ${response.status}`);
    return parseRawJSON(extractProviderText('anthropic', await response.json()));
  }

  throw new Error(`Anbieter '${provider}' wird im Dateimodus nicht direkt unterstützt.`);
}

// Zentrale Einstiegsfunktion. endpoint: 'analyze' (Text) oder 'extract' (Vision).
// Gibt das geparste JSON-Objekt der LLM-Antwort zurück.
export async function callLLM({ settings, storageMode, systemPrompt, userPrompt, images = [], endpoint = 'analyze' }) {
  if (storageMode === 'sqlite') {
    const model = settings.provider === 'ollama'
      ? (images.length > 0 ? (settings.ollamaVisionModel || DEFAULT_OLLAMA_VISION_MODEL) : settings.ollamaModel)
      : settings.apiModel;

    const data = await api.post(`/api/${endpoint}`, {
      provider: settings.provider,
      model,
      systemPrompt,
      userPrompt,
      images,
      ollamaUrl: settings.ollamaUrl,
      apiKey: settings.apiKey,
      customBaseUrl: settings.customBaseUrl
    });

    return parseRawJSON(extractProviderText(settings.provider, data));
  }

  return fetchClientSideLLM(settings, systemPrompt, userPrompt, images);
}

// Listet lokal installierte Ollama-Modelle für das Modell-Dropdown in den Einstellungen.
export async function fetchOllamaModels(storageMode, ollamaUrl) {
  const url = ollamaUrl || 'http://localhost:11434';
  if (storageMode === 'sqlite') {
    const { models } = await api.get(`/api/ollama-models?url=${encodeURIComponent(url)}`);
    return models;
  }
  const response = await fetch(`${url}/api/tags`);
  if (!response.ok) throw new Error(`Ollama-Server antwortete mit Status ${response.status}`);
  const data = await response.json();
  return (data.models || []).map(m => m.name);
}
