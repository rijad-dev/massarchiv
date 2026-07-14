import React, { useState, useEffect, useRef } from 'react';
import { Ruler, Settings, Loader2, Shirt, Sparkles, Clock, User, AlertTriangle } from 'lucide-react';
import WardrobeTab from './components/WardrobeTab';
import AnalyzeTab from './components/AnalyzeTab';
import HistoryTab from './components/HistoryTab';
import GarmentForm from './components/GarmentForm';
import GarmentDetail from './components/GarmentDetail';
import SettingsModal from './components/SettingsModal';
import ProfileModal, { EMPTY_PROFILE } from './components/ProfileModal';
import Toast from './components/Toast';
import { uid, emptyChart, downloadJSON, DEFAULT_OLLAMA_TEXT_MODEL, DEFAULT_OLLAMA_VISION_MODEL } from './utils/helpers';
import { persistImages } from './utils/image';
import { api } from './utils/api';

const DEFAULT_SETTINGS = {
  provider: 'ollama',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: DEFAULT_OLLAMA_TEXT_MODEL,
  ollamaVisionModel: DEFAULT_OLLAMA_VISION_MODEL,
  apiKey: '',
  apiModel: '',
  customBaseUrl: ''
};

export default function App() {
  const [tab, setTab] = useState('wardrobe');
  const [wardrobe, setWardrobe] = useState([]);
  const [history, setHistory] = useState([]);
  const [initializing, setInitializing] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [transferSourceId, setTransferSourceId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [analyzePrefill, setAnalyzePrefill] = useState(null);
  const [analyzeDirty, setAnalyzeDirty] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [storageMode, setStorageMode] = useState('local'); // 'sqlite' or 'local'
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  // Sichtbare Statusmeldung (unten rechts) statt stillem console.error —
  // fehlgeschlagene Speichervorgänge dürfen nie wie Erfolge aussehen.
  const showToast = (message, type = 'error') => {
    clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 6000);
  };

  useEffect(() => () => clearTimeout(toastTimerRef.current), []);

  // Auto-detect server and load initial data
  useEffect(() => {
    (async () => {
      // 1. Load Settings
      try {
        const storedSettings = localStorage.getItem('settings');
        if (storedSettings) {
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(storedSettings) });
        }
      } catch (e) {
        console.error('Fehler beim Laden der Einstellungen:', e);
      }

      // 2. Detect storage backend (Express SQLite vs localStorage)
      try {
        const wData = await api.get('/api/wardrobe');
        setWardrobe(wData);

        try {
          setHistory(await api.get('/api/history'));
        } catch { /* Verlauf ist optional — Garderobe reicht für den SQLite-Modus */ }

        try {
          const pData = await api.get('/api/profile');
          if (pData && Object.keys(pData).length) setProfile({ ...EMPTY_PROFILE, ...pData });
        } catch { /* Steckbrief ist optional */ }

        setStorageMode('sqlite');
        console.log('Maßarchiv: SQLite-Speicher geladen.');
      } catch (e) {
        console.log('Kein lokaler Server erreichbar. Nutze Browser-Speicher (localStorage).', e);
        setStorageMode('local');

        // Load from localStorage
        try {
          const storedW = localStorage.getItem('wardrobe');
          if (storedW) setWardrobe(JSON.parse(storedW));

          const storedH = localStorage.getItem('analyses');
          if (storedH) setHistory(JSON.parse(storedH));

          const storedP = localStorage.getItem('profile');
          if (storedP) setProfile({ ...EMPTY_PROFILE, ...JSON.parse(storedP) });
        } catch (err) {
          console.error('Fehler beim Laden aus localStorage:', err);
        }
      }
      setInitializing(false);
    })();
  }, []);

  // Warnt vor dem Schließen/Neuladen, solange im Analyse-Tab unfertige Eingaben stehen.
  useEffect(() => {
    if (!analyzeDirty) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [analyzeDirty]);

  const handleSaveGarment = async (garment) => {
    const prevWardrobe = wardrobe;
    const exists = wardrobe.some(g => g.id === garment.id);
    const nextWardrobe = exists
      ? wardrobe.map(g => (g.id === garment.id ? garment : g))
      : [...wardrobe, garment];

    setWardrobe(nextWardrobe);
    setShowForm(false);
    setEditing(null);

    if (storageMode === 'sqlite') {
      try {
        await api.post('/api/wardrobe', garment);
      } catch (e) {
        // Rollback + Formular mit den Eingaben wieder öffnen — nichts geht verloren
        setWardrobe(prevWardrobe);
        setEditing(garment);
        setShowForm(true);
        showToast(`Speichern fehlgeschlagen: ${e.message}`);
        return;
      }
    } else {
      localStorage.setItem('wardrobe', JSON.stringify(nextWardrobe));
    }

    // Kam das Teil aus dem Verlauf (oder dem Analyse-Ergebnis)? Dann Eintrag
    // aus dem Verlauf entfernen — es lebt jetzt in der Garderobe weiter.
    if (transferSourceId) {
      const sourceId = transferSourceId;
      setTransferSourceId(null);
      await handleDeleteHistory(sourceId);
    }
  };

  const handleDeleteGarment = async (id) => {
    const prevWardrobe = wardrobe;
    const nextWardrobe = wardrobe.filter(g => g.id !== id);
    setWardrobe(nextWardrobe);
    if (detailId === id) setDetailId(null);

    if (storageMode === 'sqlite') {
      try {
        await api.delete(`/api/wardrobe/${id}`);
      } catch (e) {
        setWardrobe(prevWardrobe);
        showToast(`Löschen fehlgeschlagen: ${e.message}`);
      }
    } else {
      localStorage.setItem('wardrobe', JSON.stringify(nextWardrobe));
    }
  };

  const handleAnalyzed = async (entry) => {
    const prevHistory = history;
    const nextHistory = [entry, ...history].slice(0, 50);
    setHistory(nextHistory);

    if (storageMode === 'sqlite') {
      try {
        await api.post('/api/history', entry);
      } catch (e) {
        setHistory(prevHistory);
        showToast(`Analyse konnte nicht im Verlauf gespeichert werden: ${e.message}`);
      }
    } else {
      localStorage.setItem('analyses', JSON.stringify(nextHistory));
    }
  };

  const handleDeleteHistory = async (id) => {
    const prevHistory = history;
    const nextHistory = history.filter(h => h.id !== id);
    setHistory(nextHistory);

    if (storageMode === 'sqlite') {
      try {
        await api.delete(`/api/history/${id}`);
      } catch (e) {
        setHistory(prevHistory);
        showToast(`Löschen des Verlaufseintrags fehlgeschlagen: ${e.message}`);
      }
    } else {
      localStorage.setItem('analyses', JSON.stringify(nextHistory));
    }
  };

  const handleClearHistory = async () => {
    const prevHistory = history;
    setHistory([]);

    if (storageMode === 'sqlite') {
      try {
        await api.delete('/api/history');
      } catch (e) {
        setHistory(prevHistory);
        showToast(`Verlauf leeren fehlgeschlagen: ${e.message}`);
      }
    } else {
      localStorage.setItem('analyses', JSON.stringify([]));
    }
  };

  // Verlaufseintrag → Garderobe: öffnet das Formular vorbefüllt zur Bestätigung.
  // Nach dem Speichern wird der Verlaufseintrag entfernt (siehe handleSaveGarment).
  const handleTransferToWardrobe = (entry) => {
    setEditing({
      id: uid(),
      brand: entry.brand || '',
      name: entry.name || '',
      category: entry.category || 'Sonstiges',
      material: entry.material || '',
      ownedSize: entry.result?.empfohleneGroesse || '',
      fit: 'Ungetragen / unsicher',
      fitNote: '',
      productNote: entry.productNote || '',
      links: entry.links || [],
      chart: entry.chart || emptyChart(entry.category || 'Sonstiges'),
      images: entry.images || [],
      thumbnail: entry.thumbnail || null,
    });
    setTransferSourceId(entry.id);
    setShowForm(true);
  };

  // Verlaufseintrag erneut prüfen: lädt Daten in den Analyse-Tab (ohne alten Eintrag zu löschen).
  const handleRecheck = (entry) => {
    setAnalyzePrefill({
      prefillId: uid(),
      brand: entry.brand || '',
      name: entry.name || '',
      category: entry.category || 'Sonstiges',
      material: entry.material || '',
      productNote: entry.productNote || '',
      links: entry.links || [],
      chart: entry.chart || emptyChart(entry.category || 'Sonstiges'),
      images: entry.images || [],
    });
    setTab('analyze');
  };

  const handleSaveSettings = (newSettings) => {
    setSettings(newSettings);
    localStorage.setItem('settings', JSON.stringify(newSettings));
    setShowSettings(false);
  };

  const handleSaveProfile = async (newProfile) => {
    setProfile(newProfile);
    setShowProfile(false);
    if (storageMode === 'sqlite') {
      try {
        await api.post('/api/profile', newProfile);
      } catch (e) {
        // Eingaben im Speicher behalten, aber klar machen, dass sie nicht persistiert sind
        showToast(`Steckbrief konnte nicht gespeichert werden (${e.message}) — Änderungen gehen beim Neuladen verloren.`);
      }
    } else {
      localStorage.setItem('profile', JSON.stringify(newProfile));
    }
  };

  // Lädt ein Bild (Server-URL oder bereits eingebettete dataURL) als dataURL,
  // damit Backups eigenständig sind — auch nach einem Rechnerwechsel, wenn der
  // uploads/-Ordner nicht mehr existiert.
  const imageUrlToDataUrl = async (url) => {
    if (!url || url.startsWith('data:')) return url;
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Bild konnte nicht gelesen werden'));
      reader.readAsDataURL(blob);
    });
  };

  const embedImages = async (images) => Promise.all((images || []).map(async img => {
    try {
      return { ...img, url: await imageUrlToDataUrl(img.url) };
    } catch {
      return img; // Fallback: Referenz behalten, falls das Bild nicht mehr erreichbar ist
    }
  }));

  const handleExportBackup = async () => {
    setBackupBusy(true);
    try {
      const wardrobeEmbedded = await Promise.all(wardrobe.map(async g => {
        const images = await embedImages(g.images);
        return { ...g, images, thumbnail: await imageUrlToDataUrl(g.thumbnail).catch(() => g.thumbnail) };
      }));
      const historyEmbedded = await Promise.all(history.map(async h => {
        const images = await embedImages(h.images);
        return { ...h, images, thumbnail: await imageUrlToDataUrl(h.thumbnail).catch(() => h.thumbnail) };
      }));
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        wardrobe: wardrobeEmbedded,
        history: historyEmbedded,
        profile,
        settings: { ...settings, apiKey: '' }
      };
      downloadJSON(payload, `massarchiv-backup-${new Date().toISOString().slice(0, 10)}.json`);
      showToast('Backup exportiert.', 'success');
    } catch (e) {
      console.error(e);
      showToast(`Export fehlgeschlagen: ${e.message || 'Unbekannter Fehler'}`);
    } finally {
      setBackupBusy(false);
    }
  };

  const handleImportBackup = async (file) => {
    setBackupBusy(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed.wardrobe) || !Array.isArray(parsed.history) || typeof parsed.profile !== 'object') {
        throw new Error('Ungültige Backup-Datei.');
      }
      const confirmMsg =
        `Dies ersetzt deine aktuellen ${wardrobe.length} Kleidungsstücke und ${history.length} ` +
        `Verlaufseinträge durch den Inhalt der Backup-Datei (${parsed.wardrobe.length} Kleidungsstücke, ` +
        `${parsed.history.length} Verlaufseinträge). Fortfahren?`;
      if (!window.confirm(confirmMsg)) return;

      // Bilder aus dem Backup neu materialisieren und JEDE Entität sofort
      // speichern, bevor die nächste startet — niemals erst alle Bilder
      // hochladen und dann in einer separaten Schleife posten. Der
      // serverseitige Upload-Cleanup läuft nach jedem Speichern und stuft
      // jedes hochgeladene, aber noch nicht in der DB referenzierte Bild als
      // verwaist ein — bei „alles hochladen, dann alles posten" hätte das
      // die noch unreferenzierten Bilder anderer Teile gelöscht (realer Bug,
      // beim Testen aufgetreten: dabei gingen echte Fotos verloren).
      const wardrobeToImport = [];
      const historyToImport = [];
      if (storageMode === 'sqlite') {
        for (const g of parsed.wardrobe) {
          const images = await persistImages(g.images || [], storageMode);
          const produkt = images.find(i => i.kind === 'produkt') || images[0] || null;
          const entity = { ...g, images, thumbnail: produkt ? produkt.url : null };
          wardrobeToImport.push(entity);
          await api.post('/api/wardrobe', entity);
        }
        for (const h of parsed.history) {
          const images = await persistImages(h.images || [], storageMode);
          const produkt = images.find(i => i.kind === 'produkt') || images[0] || null;
          const entity = { ...h, images, thumbnail: produkt ? produkt.url : null };
          historyToImport.push(entity);
          await api.post('/api/history', entity);
        }
        if (parsed.profile) {
          await api.post('/api/profile', parsed.profile);
        }
        // Erst jetzt, wo alle importierten Bilder referenziert sind, altes
        // Material löschen, das nicht im Backup enthalten war.
        const importedWardrobeIds = new Set(wardrobeToImport.map(g => g.id));
        for (const g of wardrobe) {
          if (!importedWardrobeIds.has(g.id)) {
            try { await api.delete(`/api/wardrobe/${g.id}`); } catch (e) { console.error(e); }
          }
        }
        const importedHistoryIds = new Set(historyToImport.map(h => h.id));
        for (const h of history) {
          if (!importedHistoryIds.has(h.id)) {
            try { await api.delete(`/api/history/${h.id}`); } catch (e) { console.error(e); }
          }
        }
      } else {
        for (const g of parsed.wardrobe) {
          const images = await persistImages(g.images || [], storageMode);
          const produkt = images.find(i => i.kind === 'produkt') || images[0] || null;
          wardrobeToImport.push({ ...g, images, thumbnail: produkt ? produkt.url : null });
        }
        for (const h of parsed.history) {
          const images = await persistImages(h.images || [], storageMode);
          const produkt = images.find(i => i.kind === 'produkt') || images[0] || null;
          historyToImport.push({ ...h, images, thumbnail: produkt ? produkt.url : null });
        }
        localStorage.setItem('wardrobe', JSON.stringify(wardrobeToImport));
        localStorage.setItem('analyses', JSON.stringify(historyToImport));
        localStorage.setItem('profile', JSON.stringify(parsed.profile || {}));
      }

      setWardrobe(wardrobeToImport);
      setHistory(historyToImport.slice(0, 50));
      setProfile({ ...EMPTY_PROFILE, ...(parsed.profile || {}) });
      if (parsed.settings) {
        const importedSettings = { ...DEFAULT_SETTINGS, ...parsed.settings };
        setSettings(importedSettings);
        localStorage.setItem('settings', JSON.stringify(importedSettings));
      }
      showToast(
        'Backup erfolgreich importiert.' +
        (parsed.settings && parsed.settings.provider !== 'ollama'
          ? ' Der API-Key wurde aus Sicherheitsgründen nicht mit exportiert — bitte in den Einstellungen erneut eingeben.'
          : ''),
        'success'
      );
    } catch (e) {
      console.error(e);
      showToast(`Import fehlgeschlagen: ${e.message || 'Unbekannter Fehler'}`);
    } finally {
      setBackupBusy(false);
    }
  };

  // Verlässt den Analyse-Tab nur nach Bestätigung, wenn dort unfertige Eingaben stehen.
  const switchTab = (nextTab) => {
    if (tab === 'analyze' && nextTab !== 'analyze') {
      if (analyzeDirty && !window.confirm('Ungespeicherte Eingaben bei „Neues Produkt prüfen" verwerfen?')) return;
      setAnalyzeDirty(false); // AnalyzeTab unmountet gleich — Zustand nicht stehen lassen
    }
    setTab(nextTab);
  };

  if (initializing) {
    return (
      <div className="sm-root flex flex-col items-center justify-center min-h-screen gap-4">
        <Loader2 size={36} className="animate-spin sm-text-tape" />
        <span className="sm-font-label text-sm uppercase tracking-wider sm-text-ink-60">Maßarchiv lädt...</span>
      </div>
    );
  }

  const isFileProtocol = window.location.protocol === 'file:';

  return (
    <div className="sm-root p-4 sm:p-8">

      {/* Container */}
      <div className="max-w-5xl mx-auto">

        {isFileProtocol && (
          <div className="mb-6 p-4 bg-[#A8412F]/10 border border-[#A8412F]/30 rounded-sm text-sm text-[#A8412F] flex flex-col gap-2 shadow-sm">
            <span className="font-bold uppercase tracking-wider text-xs flex items-center gap-1.5">
              <AlertTriangle size={14} /> Sicherheits-Einschränkung (Dateimodus)
            </span>
            <p className="leading-relaxed">
              Du hast die HTML-Datei direkt als lokale Datei geöffnet (<code>file://</code>).
              Aufgrund von Browser-Sicherheitsrichtlinien (CORS) blockiert der Browser hier meistens die Verbindung zu Ollama und das Speichern von Daten.
            </p>
            <p className="font-semibold">
              Starte stattdessen den lokalen Server (<code>npm start</code>) und öffne die App unter
              <a href="http://localhost:4215" target="_blank" rel="noopener noreferrer" className="underline ml-1 font-bold text-black hover:text-[#C9971F]">
                http://localhost:4215
              </a>
            </p>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b sm-border-graph pb-6 mb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 sm-text-tape sm-font-label uppercase tracking-wider text-xs font-semibold">
              <Ruler size={14} /> Persönliches Passform-Archiv
            </div>
            <h1 className="sm-font-label uppercase tracking-wide text-3xl font-extrabold sm-text-ink">Maßarchiv</h1>
            <p className="text-sm sm-text-ink-60 max-w-xl">
              Vergleiche neue Größentabellen mit deiner Garderobe per lokaler KI (Ollama) für die perfekte Empfehlung.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <button
              onClick={() => setShowProfile(true)}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 border sm-border-graph bg-[#FBF9F3] hover:border-[#C9971F] rounded transition-all text-xs font-semibold sm-font-label uppercase tracking-wider"
              title="Steckbrief öffnen"
              type="button"
            >
              <User size={14} className="sm-text-ink-60" /> <span className="hidden sm:inline">Steckbrief</span>
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 border sm-border-graph bg-[#FBF9F3] hover:border-[#C9971F] rounded transition-all text-xs font-semibold sm-font-label uppercase tracking-wider"
              title="Einstellungen öffnen"
              type="button"
            >
              <Settings size={14} className="sm-text-ink-60" /> <span className="hidden sm:inline">Einstellungen</span>
            </button>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex items-center gap-3 sm:gap-6 flex-wrap border-b sm-border-graph mb-6">
          <button
            onClick={() => switchTab('wardrobe')}
            className={`sm-tab flex items-center gap-1.5 whitespace-nowrap ${tab === 'wardrobe' ? 'sm-tab-active' : ''}`}
            type="button"
          >
            <Shirt size={14} /> Garderobe ({wardrobe.length})
          </button>
          <button
            onClick={() => switchTab('analyze')}
            className={`sm-tab flex items-center gap-1.5 whitespace-nowrap ${tab === 'analyze' ? 'sm-tab-active' : ''}`}
            type="button"
          >
            <Sparkles size={14} /> Neues Produkt prüfen
          </button>
          <button
            onClick={() => switchTab('history')}
            className={`sm-tab flex items-center gap-1.5 whitespace-nowrap ${tab === 'history' ? 'sm-tab-active' : ''}`}
            type="button"
          >
            <Clock size={14} /> Verlauf ({history.length})
          </button>
        </div>

        {/* Content Tabs */}
        {tab === 'wardrobe' && (
          <WardrobeTab
            wardrobe={wardrobe}
            onAdd={() => { setEditing(null); setShowForm(true); }}
            onEdit={(g) => { setEditing(g); setShowForm(true); }}
            onDelete={handleDeleteGarment}
            onOpenDetail={(g) => setDetailId(g.id)}
          />
        )}

        {tab === 'analyze' && (
          <AnalyzeTab
            wardrobe={wardrobe}
            settings={settings}
            storageMode={storageMode}
            profile={profile}
            prefill={analyzePrefill}
            onAnalyzed={handleAnalyzed}
            onTransfer={handleTransferToWardrobe}
            onDirtyChange={setAnalyzeDirty}
            onOpenReference={(garment) => setDetailId(garment.id)}
          />
        )}

        {tab === 'history' && (
          <HistoryTab
            history={history}
            onDelete={handleDeleteHistory}
            onClearAll={handleClearHistory}
            onTransfer={handleTransferToWardrobe}
            onRecheck={handleRecheck}
          />
        )}
      </div>

      {/* Garment creation / editing Modal */}
      {showForm && (
        <GarmentForm
          initial={editing}
          settings={settings}
          storageMode={storageMode}
          onSave={handleSaveGarment}
          onCancel={() => { setShowForm(false); setEditing(null); setTransferSourceId(null); }}
        />
      )}

      {/* Garment detail view with image gallery */}
      {detailId && (() => {
        const detailGarment = wardrobe.find(g => g.id === detailId);
        if (!detailGarment) return null;
        return (
          <GarmentDetail
            garment={detailGarment}
            storageMode={storageMode}
            onClose={() => setDetailId(null)}
            onEdit={(g) => { setDetailId(null); setEditing(g); setShowForm(true); }}
            onDelete={handleDeleteGarment}
            onUpdate={handleSaveGarment}
          />
        );
      })()}

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          settings={settings}
          storageMode={storageMode}
          onSave={handleSaveSettings}
          onCancel={() => setShowSettings(false)}
          onExportBackup={handleExportBackup}
          onImportBackup={handleImportBackup}
          backupBusy={backupBusy}
        />
      )}

      {/* Steckbrief Modal */}
      {showProfile && (
        <ProfileModal
          profile={profile}
          wardrobe={wardrobe}
          settings={settings}
          storageMode={storageMode}
          onSave={handleSaveProfile}
          onCancel={() => setShowProfile(false)}
        />
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
