import React, { useState } from 'react';
import { Clock, Trash2, Shirt, RefreshCw, ChevronDown, ChevronUp, Search, X, Link as LinkIcon, StickyNote } from 'lucide-react';
import { matchesQuery, linkLabel, normalizeUrl } from '../utils/helpers';

function ChartTable({ chart }) {
  if (!chart || !chart.sizes?.some(s => s && s.trim())) return null;
  return (
    <div className="overflow-x-auto border sm-border-graph rounded-sm bg-white/50 mt-2">
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr className="bg-black/5">
            <th className="p-1.5 text-left sm-font-label uppercase tracking-wide sm-text-ink-60 border-b border-r sm-border-graph">Größe</th>
            {chart.measurements.map((m, i) => (
              <th key={i} className="p-1.5 text-right sm-font-label uppercase tracking-wide sm-text-ink-60 border-b border-r sm-border-graph">{m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {chart.sizes.map((s, si) => (
            s && s.trim() ? (
              <tr key={si}>
                <td className="p-1.5 sm-font-mono font-semibold border-b border-r sm-border-graph">{s}</td>
                {chart.measurements.map((_, mi) => (
                  <td key={mi} className="p-1.5 sm-font-mono text-right border-b border-r sm-border-graph">
                    {(chart.values[si] && chart.values[si][mi]) || '—'}
                  </td>
                ))}
              </tr>
            ) : null
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function HistoryTab({ history, onDelete, onClearAll, onTransfer, onRecheck }) {
  const [expandedId, setExpandedId] = useState(null);
  const [query, setQuery] = useState('');

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-20 gap-4 border border-dashed sm-border-graph rounded bg-[#FBF9F3]/60 max-w-4xl mx-auto shadow-inner">
        <Clock size={44} className="sm-text-ink-40" />
        <div>
          <div className="sm-font-label uppercase tracking-wide text-sm sm-text-ink font-semibold">Noch keine Analysen</div>
          <p className="text-sm sm-text-ink-60 max-w-xs mt-2 px-4 leading-relaxed">
            Deine geprüften Produkte und empfohlenen Größen erscheinen hier — inklusive Fotos.
          </p>
        </div>
      </div>
    );
  }

  const filtered = history.filter(h =>
    matchesQuery(query, h.brand, h.name, h.category, h.material, h.productNote, h.links, h.result?.empfohleneGroesse)
  );

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <div className="text-sm sm-text-ink-60 font-medium">
          {history.length} Analyse{history.length === 1 ? '' : 'n'} im Verlauf
        </div>
        <button
          onClick={() => { if (window.confirm('Wirklich den gesamten Verlauf löschen?')) onClearAll(); }}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-[#A8412F]/30 text-[#A8412F] rounded hover:bg-[#A8412F]/10 transition-all sm-font-label uppercase tracking-wider font-semibold"
          type="button"
        >
          <Trash2 size={13} /> Verlauf leeren
        </button>
      </div>

      {/* Suchfeld */}
      <div className="relative">
        {!query && (
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 sm-text-ink-40 pointer-events-none" />
        )}
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Verlauf durchsuchen (Marke, Modell, Notizen …)"
          className={`sm-input ${query ? 'pl-3' : 'pl-9'} pr-9`}
        />
        {query && (
          <button onClick={() => setQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 sm-icon-btn p-1 hover:bg-black/5 rounded" type="button">
            <X size={14} />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-14 gap-3 border border-dashed sm-border-graph rounded bg-[#FBF9F3]/60">
          <Search size={30} className="sm-text-ink-40" />
          <div className="text-sm sm-text-ink-60">Keine Treffer für <span className="font-semibold">„{query}"</span>.</div>
        </div>
      ) : filtered.map(h => {
        const expanded = expandedId === h.id;
        const hasChart = h.chart && h.chart.sizes?.some(s => s && s.trim());
        const validLinks = (h.links || []).filter(Boolean);
        return (
          <div key={h.id} className="sm-card p-4 sm:p-5 sm-bg-card relative overflow-hidden group">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#C9971F] opacity-70 group-hover:opacity-100 transition-opacity" />

            <div className="flex flex-col sm:flex-row items-start gap-4 pl-1">
              {/* Foto */}
              {(h.thumbnail || h.images?.[0]?.url) && (
                <img
                  src={h.thumbnail || h.images[0].url}
                  alt=""
                  className="w-20 h-20 object-cover rounded-sm border sm-border-graph shrink-0"
                />
              )}

              <div className="flex-1 min-w-0 w-full">
                <div className="flex items-start justify-between flex-wrap gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="sm-font-label uppercase tracking-wide text-[10px] sm-text-tape font-semibold">
                      {h.category}
                    </div>
                    <div className="font-semibold text-lg sm-text-ink mt-0.5 truncate">
                      {h.brand} <span className="sm-text-ink-60 font-normal">— {h.name || 'ohne Namen'}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="sm-font-mono text-2xl font-bold sm-text-ink tracking-tight bg-black/5 px-2.5 py-0.5 rounded">
                      {h.result?.empfohleneGroesse || 'Unbekannt'}
                    </div>
                    {h.result?.confidence && (
                      <span className="text-[10px] sm-font-label uppercase tracking-wide px-1.5 py-0.2 border rounded opacity-80">
                        Konfidenz: {h.result.confidence}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-[11px] sm-text-ink-40 mb-2 font-medium">
                  Geprüft am: {new Date(h.date).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
              </div>
            </div>

            {/* Weitere Bilder */}
            {h.images?.length > 1 && (
              <div className="flex gap-1.5 flex-wrap pl-1 mb-2">
                {h.images.map(img => (
                  <img key={img.id} src={img.url} alt="" className="w-12 h-12 object-cover rounded-sm border sm-border-graph" />
                ))}
              </div>
            )}

            <div className="text-sm sm-text-ink-60 pl-1 leading-relaxed border-t sm-border-graph pt-3">
              <span className="font-semibold text-black block mb-1 text-xs sm-font-label uppercase tracking-wide">Begründung:</span>
              {h.result?.begruendung || 'Keine Begründung vorhanden.'}
            </div>

            {h.result?.tipp && (
              <div className="mt-3 ml-1 text-xs bg-[#C9971F]/5 p-2 border sm-border-graph rounded text-yellow-900 italic">
                💡 {h.result.tipp}
              </div>
            )}

            {/* Notiz + Links */}
            {h.productNote && (
              <div className="mt-3 ml-1 text-xs sm-text-ink-60 flex items-start gap-1.5">
                <StickyNote size={13} className="sm-text-tape mt-0.5 shrink-0" />
                <span className="italic">{h.productNote}</span>
              </div>
            )}
            {validLinks.length > 0 && (
              <div className="mt-2 ml-1 flex flex-wrap gap-x-3 gap-y-1">
                {validLinks.map((l, i) => (
                  <a
                    key={i}
                    href={normalizeUrl(l)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#3B6EA5] hover:underline flex items-center gap-1"
                  >
                    <LinkIcon size={11} /> {linkLabel(normalizeUrl(l))}
                  </a>
                ))}
              </div>
            )}

            {/* Größentabelle (aufklappbar) */}
            {hasChart && (
              <div className="pl-1 mt-3">
                <button
                  onClick={() => setExpandedId(expanded ? null : h.id)}
                  className="flex items-center gap-1 text-[11px] sm-text-ink-60 hover:text-black sm-font-label uppercase tracking-wide font-semibold"
                  type="button"
                >
                  {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  Größentabelle {expanded ? 'ausblenden' : 'anzeigen'}
                </button>
                {expanded && <ChartTable chart={h.chart} />}
              </div>
            )}

            {/* Aktionen */}
            <div className="flex items-center gap-2 pl-1 mt-4 pt-3 border-t border-dashed sm-border-graph flex-wrap">
              <button
                onClick={() => onTransfer(h)}
                className="sm-btn-primary flex items-center gap-1.5 text-xs"
                type="button"
              >
                <Shirt size={13} /> In Garderobe übernehmen
              </button>
              <button
                onClick={() => onRecheck(h)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 border sm-border-graph rounded hover:border-[#C9971F] transition-all sm-font-label uppercase tracking-wider font-semibold sm-text-ink-60 hover:text-black"
                type="button"
              >
                <RefreshCw size={13} /> Erneut prüfen
              </button>
              <button
                onClick={() => { if (window.confirm('Diesen Verlaufseintrag wirklich löschen?')) onDelete(h.id); }}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-[#A8412F]/30 text-[#A8412F] rounded hover:bg-[#A8412F]/10 transition-all sm-font-label uppercase tracking-wider font-semibold ml-auto"
                type="button"
              >
                <Trash2 size={13} /> Löschen
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
