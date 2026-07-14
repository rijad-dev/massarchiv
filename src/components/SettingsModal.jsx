import React, { useState, useRef } from 'react';
import { X, Settings, Server, Database, Sparkles, HelpCircle, Download, Upload, Loader2, RefreshCw } from 'lucide-react';
import Modal from './Modal';
import { fetchOllamaModels } from '../utils/llm';
import { DEFAULT_OLLAMA_TEXT_MODEL, DEFAULT_OLLAMA_VISION_MODEL } from '../utils/helpers';

export default function SettingsModal({ settings, onSave, onCancel, storageMode, onExportBackup, onImportBackup, backupBusy }) {
  const [provider, setProvider] = useState(settings.provider || 'ollama');
  const [ollamaUrl, setOllamaUrl] = useState(settings.ollamaUrl || 'http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState(settings.ollamaModel || DEFAULT_OLLAMA_TEXT_MODEL);
  const [ollamaVisionModel, setOllamaVisionModel] = useState(settings.ollamaVisionModel || DEFAULT_OLLAMA_VISION_MODEL);
  const [apiKey, setApiKey] = useState(settings.apiKey || '');
  const [apiModel, setApiModel] = useState(settings.apiModel || '');
  const [customBaseUrl, setCustomBaseUrl] = useState(settings.customBaseUrl || '');
  const [installedModels, setInstalledModels] = useState(null);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const importInputRef = useRef(null);

  const refreshModels = async () => {
    setModelsBusy(true);
    setModelsError('');
    try {
      setInstalledModels(await fetchOllamaModels(storageMode, ollamaUrl));
    } catch (e) {
      setModelsError(e.message || 'Modelle konnten nicht geladen werden');
    } finally {
      setModelsBusy(false);
    }
  };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onImportBackup(file);
  };

  const handleSave = () => {
    onSave({
      provider,
      ollamaUrl: ollamaUrl.trim(),
      ollamaModel: ollamaModel.trim(),
      ollamaVisionModel: ollamaVisionModel.trim(),
      apiKey: apiKey.trim(),
      apiModel: apiModel.trim(),
      customBaseUrl: customBaseUrl.trim(),
    });
  };

  return (
    <Modal onClose={onCancel} label="Einstellungen" maxWidthClass="max-w-lg" className="overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b sm-border-graph">
          <h3 className="sm-font-label uppercase tracking-wide text-sm sm-text-ink flex items-center gap-2">
            <Settings size={16} className="sm-text-tape" />
            Einstellungen
          </h3>
          <button onClick={onCancel} className="sm-icon-btn" type="button">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          
          {/* Storage Information */}
          <div className="sm-card p-3 sm-bg-card flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs sm-font-label uppercase tracking-wide sm-text-ink-60">
              <Database size={14} className="sm-text-tape" />
              Speicher-Modus
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Aktiver Speicher:</span>
              <span className={`sm-badge ${storageMode === 'sqlite' ? 'sm-badge-good' : 'sm-badge-mid'}`}>
                {storageMode === 'sqlite' ? 'Localhost (SQLite)' : 'Browser (localStorage)'}
              </span>
            </div>
            <p className="text-xs sm-text-ink-60 leading-relaxed mt-1">
              {storageMode === 'sqlite'
                ? 'Daten werden persistent in der Datei wardrobe.db auf deinem Rechner gespeichert.'
                : 'Der Server ist offline. Daten werden temporär im Browser-Speicher abgelegt. Starte den Node-Server für SQLite.'}
            </p>
          </div>

          {/* Datensicherung */}
          <div className="sm-card p-3 sm-bg-card flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs sm-font-label uppercase tracking-wide sm-text-ink-60">
              <Database size={14} className="sm-text-tape" />
              Datensicherung
            </div>
            <p className="text-xs sm-text-ink-60 leading-relaxed">
              Sichert Garderobe, Verlauf und Steckbrief (inkl. Fotos) als Datei — z. B. vor einem Rechnerwechsel.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={onExportBackup}
                disabled={backupBusy}
                className="sm-btn-ghost text-xs flex items-center gap-1.5 px-3 py-1.5 border sm-border-graph rounded"
                type="button"
              >
                {backupBusy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Backup exportieren
              </button>
              <button
                onClick={() => importInputRef.current?.click()}
                disabled={backupBusy}
                className="sm-btn-ghost text-xs flex items-center gap-1.5 px-3 py-1.5 border sm-border-graph rounded"
                type="button"
              >
                <Upload size={13} /> Backup importieren
              </button>
              <input ref={importInputRef} type="file" accept="application/json" className="hidden" onChange={handleImportFile} />
            </div>
          </div>

          {/* LLM Provider Selection */}
          <div className="space-y-2">
            <label className="block sm-font-label uppercase tracking-wide text-xs sm-text-ink-60">
              LLM Anbieter
            </label>
            <select
              value={provider}
              onChange={e => setProvider(e.target.value)}
              className="sm-input"
            >
              <option value="ollama">Ollama (Lokal — Empfohlen)</option>
              <option value="gemini">Google Gemini API</option>
              <option value="anthropic">Anthropic Claude API</option>
              <option value="openai">OpenAI ChatGPT API</option>
            </select>
          </div>

          {/* Provider Specific Settings */}
          {provider === 'ollama' && (
            <div className="space-y-3 p-3 border sm-border-graph rounded-sm sm-bg-card">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs sm-font-label uppercase tracking-wide sm-text-tape">
                  <Server size={14} /> Ollama Konfiguration
                </div>
                <button
                  onClick={refreshModels}
                  disabled={modelsBusy}
                  className="flex items-center gap-1 text-[11px] sm-text-tape hover:text-black sm-font-label uppercase tracking-wide"
                  type="button"
                >
                  {modelsBusy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Modelle aktualisieren
                </button>
              </div>

              {modelsError && <div className="text-[11px] text-[#A8412F]">{modelsError}</div>}

              <div className="space-y-1">
                <label className="block text-xs sm-text-ink-60">Ollama Server URL</label>
                <input
                  type="text"
                  value={ollamaUrl}
                  onChange={e => setOllamaUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                  className="sm-input font-mono text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs sm-text-ink-60">Text-Modell (Analyse)</label>
                <input
                  type="text"
                  value={ollamaModel}
                  onChange={e => setOllamaModel(e.target.value)}
                  placeholder="z.B. llama3, gemma2, mistral"
                  className="sm-input font-mono text-xs"
                />
                {installedModels && (
                  <select
                    value=""
                    onChange={e => { if (e.target.value) setOllamaModel(e.target.value); }}
                    className="sm-input font-mono text-xs"
                  >
                    <option value="">— installiertes Modell wählen —</option>
                    {installedModels.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                )}
                <span className="block text-[11px] sm-text-ink-40 leading-normal">
                  Hinweis: Stelle sicher, dass du das Modell geladen hast (z.B. <code>ollama run {ollamaModel || 'llama3'}</code>).
                </span>
              </div>

              <div className="space-y-1">
                <label className="block text-xs sm-text-ink-60">Vision-Modell (Bild-Auswertung)</label>
                <input
                  type="text"
                  value={ollamaVisionModel}
                  onChange={e => setOllamaVisionModel(e.target.value)}
                  placeholder="z.B. qwen2.5vl:7b, qwen3.5, gemma4"
                  className="sm-input font-mono text-xs"
                />
                {installedModels && (
                  <select
                    value=""
                    onChange={e => { if (e.target.value) setOllamaVisionModel(e.target.value); }}
                    className="sm-input font-mono text-xs"
                  >
                    <option value="">— installiertes Modell wählen —</option>
                    {installedModels.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                )}
                <span className="block text-[11px] sm-text-ink-40 leading-normal">
                  Muss Bilder verarbeiten können (Vision) — wird für den Foto-Import genutzt, z.B. <code>qwen2.5vl:7b</code> (empfohlen) oder <code>gemma4</code>.
                </span>
              </div>
            </div>
          )}

          {provider !== 'ollama' && (
            <div className="space-y-3 p-3 border sm-border-graph rounded-sm sm-bg-card">
              <div className="flex items-center gap-1.5 text-xs sm-font-label uppercase tracking-wide sm-text-tape">
                <Sparkles size={14} /> Cloud-API-Konfiguration
              </div>

              <div className="space-y-1">
                <label className="block text-xs sm-text-ink-60">API-Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="API-Key eingeben (bleibt lokal)"
                  className="sm-input font-mono text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs sm-text-ink-60">Modell Name (optional)</label>
                <input
                  type="text"
                  value={apiModel}
                  onChange={e => setApiModel(e.target.value)}
                  placeholder={
                    provider === 'gemini' ? 'gemini-1.5-flash' : 
                    provider === 'anthropic' ? 'claude-3-5-sonnet-20241022' : 'gpt-4o-mini'
                  }
                  className="sm-input font-mono text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs sm-text-ink-60">Eigene Base-URL (optional)</label>
                <input
                  type="text"
                  value={customBaseUrl}
                  onChange={e => setCustomBaseUrl(e.target.value)}
                  placeholder="z.B. eigene Proxy-URL"
                  className="sm-input font-mono text-xs"
                />
              </div>
            </div>
          )}

          {/* CORS Info for Static Mode */}
          {storageMode === 'local' && provider === 'ollama' && (
            <div className="text-xs sm-text-ink-60 sm-warn-box border rounded p-2.5 flex gap-2">
              <HelpCircle size={16} className="sm-text-warn shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold sm-text-warn">CORS-Einschränkung bei statischer HTML:</span>
                <p className="mt-0.5 leading-normal">
                  Da die Seite als Datei geöffnet wird, blockieren Browser direkte Anfragen an <code>localhost:11434</code>. Starte Ollama mit <code>OLLAMA_ORIGINS="*"</code> (z.B. in CMD: <code>set OLLAMA_ORIGINS=*</code> und dann <code>ollama start</code>) oder nutze den empfohlenen Node-Server.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t sm-border-graph sm-bg-card">
          <button onClick={onCancel} className="sm-btn-ghost" type="button">Abbrechen</button>
          <button onClick={handleSave} className="sm-btn-primary" type="button">Speichern</button>
        </div>
    </Modal>
  );
}
