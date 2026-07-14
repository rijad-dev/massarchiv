import React, { useState } from 'react';
import { Shirt, Plus, SearchX, Search, X } from 'lucide-react';
import GarmentCard from './GarmentCard';
import { CATEGORIES, matchesQuery } from '../utils/helpers';

const SORT_OPTIONS = {
  newest: 'Neueste zuerst',
  oldest: 'Älteste zuerst',
  alpha: 'Alphabetisch A–Z',
};

function sortWardrobe(items, sortMode) {
  const sorted = [...items];
  if (sortMode === 'alpha') {
    sorted.sort((a, b) => `${a.brand} ${a.name}`.localeCompare(`${b.brand} ${b.name}`, 'de'));
  } else {
    // Teile ohne createdAt (Altbestand) fallen ans Ende, statt einen Fehler zu werfen.
    sorted.sort((a, b) => {
      const ta = a.createdAt ? Date.parse(a.createdAt) : -Infinity;
      const tb = b.createdAt ? Date.parse(b.createdAt) : -Infinity;
      return sortMode === 'oldest' ? ta - tb : tb - ta;
    });
  }
  return sorted;
}

export default function WardrobeTab({ wardrobe, onAdd, onEdit, onDelete, onOpenDetail }) {
  const [filter, setFilter] = useState('Alle');
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState('newest');

  if (wardrobe.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-20 gap-4 border border-dashed sm-border-graph rounded bg-[#FBF9F3]/60 max-w-4xl mx-auto shadow-inner">
        <div className="relative">
          <Shirt size={48} className="sm-text-ink-40" />
          <div className="absolute -top-1 -right-1 bg-[#C9971F] w-3 h-3 rounded-full animate-ping" />
        </div>
        <div>
          <div className="sm-font-label uppercase tracking-wide text-sm sm-text-ink font-semibold">Noch keine Kleidungsstücke</div>
          <p className="text-sm sm-text-ink-60 max-w-md mt-2 px-4 leading-relaxed">
            Füge Teile hinzu, die du bereits besitzt — mit Größentabelle und wie sie dir wirklich passen.
            Das ist die Vergleichsbasis für jede neue Größenempfehlung.
          </p>
        </div>
        <button onClick={onAdd} className="sm-btn-primary mt-2" type="button">
          Erstes Teil hinzufügen
        </button>
      </div>
    );
  }

  // Kategorie-Filter: "Alle" (Standard) + alle bekannten Kategorien
  const counts = wardrobe.reduce((acc, g) => {
    acc[g.category] = (acc[g.category] || 0) + 1;
    return acc;
  }, {});
  const byCategory = filter === 'Alle' ? wardrobe : wardrobe.filter(g => g.category === filter);
  const searched = byCategory.filter(g =>
    matchesQuery(query, g.brand, g.name, g.category, g.material, g.ownedSize, g.fitNote, g.productNote, g.links)
  );
  const filtered = sortWardrobe(searched, sortMode);

  const chipClass = (active, empty) =>
    `px-2.5 py-1 rounded-sm border text-xs font-semibold sm-font-label uppercase tracking-wider transition-all ${
      active
        ? 'bg-[#C9971F] border-[#C9971F] text-white shadow-sm'
        : empty
          ? 'sm-border-graph sm-text-ink-40 bg-transparent hover:border-[#C9971F]/50'
          : 'sm-border-graph sm-text-ink-60 bg-[#FBF9F3] hover:border-[#C9971F]'
    }`;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="text-sm sm-text-ink-60 font-medium">
          {wardrobe.length} Kleidungsstück{wardrobe.length === 1 ? '' : 'e'} in deiner Garderobe
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={sortMode}
            onChange={e => setSortMode(e.target.value)}
            className="sm-input text-xs py-1.5 w-auto"
            title="Sortierung"
          >
            {Object.entries(SORT_OPTIONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <button onClick={onAdd} className="sm-btn-primary flex items-center gap-1.5" type="button">
            <Plus size={14} /> Neues Teil
          </button>
        </div>
      </div>

      {/* Suchfeld */}
      <div className="relative mb-4">
        {!query && (
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 sm-text-ink-40 pointer-events-none" />
        )}
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Garderobe durchsuchen (Marke, Modell, Notizen …)"
          className={`sm-input sm-input-search ${query ? 'is-filled' : ''}`}
        />
        {query && (
          <button onClick={() => setQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 sm-icon-btn p-1 hover:bg-black/5 rounded" type="button">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filterleiste */}
      <div className="flex items-center gap-1.5 flex-wrap mb-6 pb-4 border-b border-dashed sm-border-graph">
        <button onClick={() => setFilter('Alle')} className={chipClass(filter === 'Alle', false)} type="button">
          Alle ({wardrobe.length})
        </button>
        {Object.keys(CATEGORIES).map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={chipClass(filter === cat, !counts[cat])}
            type="button"
          >
            {cat}{counts[cat] ? ` (${counts[cat]})` : ''}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-14 gap-3 border border-dashed sm-border-graph rounded bg-[#FBF9F3]/60">
          <SearchX size={32} className="sm-text-ink-40" />
          <div className="text-sm sm-text-ink-60">
            {query
              ? <>Keine Treffer für <span className="font-semibold">„{query}"</span>{filter !== 'Alle' && <> in <span className="font-semibold">„{filter}"</span></>}.</>
              : <>Keine Teile in der Kategorie <span className="font-semibold">„{filter}"</span>.</>}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(g => (
            <GarmentCard key={g.id} garment={g} onEdit={onEdit} onDelete={onDelete} onOpenDetail={onOpenDetail} />
          ))}
        </div>
      )}
    </div>
  );
}
