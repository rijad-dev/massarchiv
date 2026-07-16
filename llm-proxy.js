// LLM-Proxy für Ollama und Cloud-APIs (Text-Analyse und Vision-Extraktion).
// Ausgelagert aus server.js. Antwortet immer mit der rohen Provider-Response —
// das Parsing übernimmt der Frontend-Client (src/utils/llm.js).

import { fetch as undiciFetch, Agent } from 'undici';

// Lokale Vision-Modelle können mehrere Minuten bis zum ersten Byte brauchen —
// der undici-Default (300 s Header-Timeout) reißt sonst mitten in der Auswertung ab.
const ollamaAgent = new Agent({ headersTimeout: 600_000, bodyTimeout: 600_000 });

// Cloud-APIs antworten in Sekunden bis wenigen Minuten — hängende Verbindungen
// nach 120 s hart abbrechen (per Umgebungsvariable LLM_CLOUD_TIMEOUT_MS übersteuerbar).
const CLOUD_TIMEOUT_MS = Number(process.env.LLM_CLOUD_TIMEOUT_MS) || 120_000;

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGES = 8;
// Base64 wächst um Faktor ~1,37 — 14 MB Base64 entsprechen ~10 MB Bilddaten.
const MAX_IMAGE_BASE64_LENGTH = 14 * 1024 * 1024;

// Validiert das images-Array aus dem Request-Body: [{ mimeType, data }]
function validateImages(images) {
  if (images === undefined || images === null) return [];
  if (!Array.isArray(images)) throw new Error('images muss ein Array sein');
  if (images.length > MAX_IMAGES) throw new Error(`Maximal ${MAX_IMAGES} Bilder pro Anfrage`);
  return images.map(img => {
    if (!img || typeof img.data !== 'string' || !img.data) {
      throw new Error('Jedes Bild braucht Base64-Daten (data)');
    }
    if (img.data.length > MAX_IMAGE_BASE64_LENGTH) {
      throw new Error('Bild zu groß (max. ~10 MB)');
    }
    const mimeType = ALLOWED_MIME.includes(img.mimeType) ? img.mimeType : 'image/jpeg';
    return { mimeType, data: img.data };
  });
}

async function callProvider({ provider, model, systemPrompt, userPrompt, images, ollamaUrl, apiKey, customBaseUrl }) {
  if (provider === 'ollama') {
    const url = ollamaUrl || 'http://localhost:11434';
    const userMessage = { role: 'user', content: userPrompt };
    if (images.length > 0) userMessage.images = images.map(i => i.data);

    const payload = {
      model: model || (images.length > 0 ? 'qwen2.5vl:7b' : 'llama3'),
      messages: [
        { role: 'system', content: systemPrompt },
        userMessage
      ],
      stream: false,
      format: 'json'
    };
    // Begrenzter Kontext: sonst lädt Ollama mit vollem 262k-Kontext (riesiger
    // KV-Cache → läuft auf CPU statt GPU) — gilt auch für große Text-Prompts
    // (Garderoben-JSON bei Größenanalyse/Steckbrief-Ermittlung).
    payload.options = { num_ctx: 16384 };
    if (images.length > 0) {
      // Thinking-Modelle (qwen3.5, gemma4) ohne Denkphase antworten lassen. Nur für Vision validiert.
      payload.think = false;
    }

    const doRequest = () => undiciFetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      dispatcher: ollamaAgent
    });

    let response = await doRequest();
    if (!response.ok) {
      const errText = await response.text();
      // Modelle ohne Thinking-Support lehnen "think" ab → einmal ohne erneut versuchen.
      if (payload.think === false && /think/i.test(errText)) {
        delete payload.think;
        response = await doRequest();
        if (!response.ok) {
          throw new Error(`Ollama Server returned ${response.status}: ${await response.text()}`);
        }
      } else {
        throw new Error(`Ollama Server returned ${response.status}: ${errText}`);
      }
    }
    return response.json();
  }

  if (provider === 'gemini') {
    const geminiModel = model || 'gemini-1.5-flash';
    const baseUrl = customBaseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    const parts = [{ text: `${systemPrompt}\n\nNutzer-Anfrage:\n${userPrompt}` }];
    images.forEach(i => parts.push({ inline_data: { mime_type: i.mimeType, data: i.data } }));

    const response = await fetch(`${baseUrl}/models/${geminiModel}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: 'application/json' }
      }),
      signal: AbortSignal.timeout(CLOUD_TIMEOUT_MS)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API returned ${response.status}: ${errText}`);
    }
    return response.json();
  }

  if (provider === 'openai') {
    const openAiModel = model || 'gpt-4o-mini';
    const baseUrl = customBaseUrl || 'https://api.openai.com/v1';
    const userContent = images.length > 0
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
        model: openAiModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        response_format: { type: 'json_object' }
      }),
      signal: AbortSignal.timeout(CLOUD_TIMEOUT_MS)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API returned ${response.status}: ${errText}`);
    }
    return response.json();
  }

  if (provider === 'anthropic') {
    const claudeModel = model || 'claude-3-5-sonnet-20241022';
    const baseUrl = customBaseUrl || 'https://api.anthropic.com/v1';
    const userContent = images.length > 0
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
        model: claudeModel,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }]
      }),
      signal: AbortSignal.timeout(CLOUD_TIMEOUT_MS)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API returned ${response.status}: ${errText}`);
    }
    return response.json();
  }

  throw new Error(`Unbekannter Anbieter: ${provider}`);
}

// Express-Handler für POST /api/analyze und POST /api/extract
export async function handleLLMRequest(req, res) {
  try {
    const { provider, systemPrompt, userPrompt } = req.body || {};
    if (!provider) return res.status(400).json({ error: 'provider fehlt' });
    if (typeof systemPrompt !== 'string' || typeof userPrompt !== 'string') {
      return res.status(400).json({ error: 'systemPrompt und userPrompt müssen Strings sein' });
    }

    const images = validateImages(req.body.images);
    console.log(`Forwarding ${images.length > 0 ? 'vision' : 'text'} request to ${provider} proxy...`);

    const data = await callProvider({ ...req.body, images });
    res.json(data);
  } catch (error) {
    console.error('API-Proxy-Fehler:', error);
    res.status(500).json({ error: error.message });
  }
}
