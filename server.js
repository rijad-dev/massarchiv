import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  getWardrobe,
  saveGarment,
  deleteGarment,
  getHistory,
  saveHistoryEntry,
  deleteHistoryEntry,
  clearHistory,
  pruneHistory,
  getProfile,
  saveProfile
} from './db.js';
import { handleLLMRequest } from './llm-proxy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4215;

const UPLOADS_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Enable CORS and JSON parsing (Limit erhöht für Base64-Bilder)
app.use(cors());
app.use(express.json({ limit: '25mb' }));

// ---------------------------------------------------------------------------
// Upload-Verwaltung
// ---------------------------------------------------------------------------

const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// Sammelt alle in Garderobe + Verlauf referenzierten Upload-Dateinamen und
// löscht alles andere aus uploads/ — deckt Entity-Löschung, entfernte Bilder
// beim Überschreiben und geteilte Referenzen (Verlauf ↔ Garderobe) sauber ab.
//
// Schutzfrist: Dateien, die jünger als CLEANUP_GRACE_MS sind, werden nie
// gelöscht — auch wenn sie aktuell in keiner DB-Zeile referenziert sind.
// Grund: Ein Client kann ein Bild hochladen (Datei existiert bereits) und
// speichert die referenzierende Zeile erst kurz danach in einem zweiten
// Request. Ohne Schutzfrist reißt ein dazwischen laufender Cleanup (durch
// einen beliebigen anderen gleichzeitigen Save/Delete) frisch hochgeladene,
// noch nicht referenzierte Bilder weg — genau das hat bei einem Mehr-Teile-
// Import echte Nutzerfotos gelöscht (siehe App.jsx handleImportBackup).
const CLEANUP_GRACE_MS = 5 * 60 * 1000;

async function cleanupOrphanedUploads() {
  try {
    const [wardrobe, history] = await Promise.all([getWardrobe(), getHistory()]);
    const referenced = new Set();
    for (const entity of [...wardrobe, ...history]) {
      const urls = [...(entity.images || []).map(i => i && i.url), entity.thumbnail];
      for (const url of urls) {
        if (typeof url === 'string' && url.startsWith('/uploads/')) {
          referenced.add(path.basename(url));
        }
      }
    }
    const now = Date.now();
    for (const file of fs.readdirSync(UPLOADS_DIR)) {
      if (referenced.has(file)) continue;
      try {
        const { mtimeMs } = fs.statSync(path.join(UPLOADS_DIR, file));
        if (now - mtimeMs < CLEANUP_GRACE_MS) continue; // zu frisch — überspringen
        fs.unlinkSync(path.join(UPLOADS_DIR, file));
      } catch { /* best effort */ }
    }
  } catch (error) {
    console.error('Upload-Cleanup fehlgeschlagen:', error.message);
  }
}

app.use('/uploads', express.static(UPLOADS_DIR));

app.post('/api/images', (req, res) => {
  try {
    let { data, mimeType } = req.body || {};
    if (typeof data !== 'string' || !data) {
      return res.status(400).json({ error: 'Bilddaten (data) fehlen' });
    }

    // dataURL-Prefix tolerieren
    const dataUrlMatch = data.match(/^data:(image\/[a-z+.-]+);base64,(.+)$/s);
    if (dataUrlMatch) {
      mimeType = dataUrlMatch[1];
      data = dataUrlMatch[2];
    }

    const ext = MIME_EXT[mimeType];
    if (!ext) {
      return res.status(400).json({ error: 'Nur JPEG, PNG oder WebP erlaubt' });
    }

    const buffer = Buffer.from(data, 'base64');
    if (buffer.length === 0) {
      return res.status(400).json({ error: 'Ungültige Base64-Daten' });
    }
    if (buffer.length > MAX_UPLOAD_BYTES) {
      return res.status(400).json({ error: 'Bild zu groß (max. 10 MB)' });
    }

    const name = `${crypto.randomBytes(8).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, name), buffer);
    res.json({ url: `/uploads/${name}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// SQLite Storage Endpoints
// ---------------------------------------------------------------------------

app.get('/api/wardrobe', async (req, res) => {
  try {
    const items = await getWardrobe();
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/wardrobe', async (req, res) => {
  try {
    if (!req.body || typeof req.body.id !== 'string' || !req.body.id) {
      return res.status(400).json({ error: 'Kleidungsstück braucht eine id' });
    }
    const item = await saveGarment(req.body);
    await cleanupOrphanedUploads();
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/wardrobe/:id', async (req, res) => {
  try {
    const result = await deleteGarment(req.params.id);
    await cleanupOrphanedUploads();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/history', async (req, res) => {
  try {
    const history = await getHistory();
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/history', async (req, res) => {
  try {
    if (!req.body || typeof req.body.id !== 'string' || !req.body.id) {
      return res.status(400).json({ error: 'Verlaufseintrag braucht eine id' });
    }
    const entry = await saveHistoryEntry(req.body);
    await pruneHistory(50);
    await cleanupOrphanedUploads();
    res.json(entry);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/history/:id', async (req, res) => {
  try {
    const result = await deleteHistoryEntry(req.params.id);
    await cleanupOrphanedUploads();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/history', async (req, res) => {
  try {
    const result = await clearHistory();
    await cleanupOrphanedUploads();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Steckbrief (ein Datensatz, id='me')
app.get('/api/profile', async (req, res) => {
  try {
    res.json(await getProfile() || {});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/profile', async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Ungültige Profildaten' });
    }
    res.json(await saveProfile(req.body));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// LLM-Proxy: Text-Analyse und Vision-Extraktion (siehe llm-proxy.js)
// ---------------------------------------------------------------------------

app.post('/api/analyze', handleLLMRequest);
app.post('/api/extract', handleLLMRequest);

// Listet lokal installierte Ollama-Modelle (für das Modell-Dropdown in den Einstellungen)
app.get('/api/ollama-models', async (req, res) => {
  try {
    const ollamaUrl = req.query.url || 'http://localhost:11434';
    const response = await fetch(`${ollamaUrl}/api/tags`);
    if (!response.ok) {
      return res.status(502).json({ error: `Ollama antwortete mit Status ${response.status}` });
    }
    const data = await response.json();
    res.json({ models: (data.models || []).map(m => m.name) });
  } catch (error) {
    res.status(502).json({ error: 'Ollama-Server nicht erreichbar. Läuft Ollama?' });
  }
});

// Serve frontend build in production
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(` Maßarchiv Server running on http://localhost:${PORT}`);
  console.log(` Storage Mode: SQLite Database`);
  console.log(`==================================================`);
});
