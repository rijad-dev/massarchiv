import React from 'react';
import { Plus, X, RotateCcw } from 'lucide-react';
import { emptyChart } from '../utils/helpers';

export default function SizeChartEditor({ chart, onChange, category }) {
  const updateMeasurementLabel = (idx, label) => {
    const measurements = [...chart.measurements];
    measurements[idx] = label;
    onChange({ ...chart, measurements });
  };

  const addMeasurement = () => {
    const measurements = [...chart.measurements, `Maß ${chart.measurements.length + 1}`];
    const values = chart.values.map(row => [...row, '']);
    onChange({ ...chart, measurements, values });
  };

  const removeMeasurement = (idx) => {
    const measurements = chart.measurements.filter((_, i) => i !== idx);
    const values = chart.values.map(row => row.filter((_, i) => i !== idx));
    onChange({ ...chart, measurements, values });
  };

  const updateSizeLabel = (idx, label) => {
    const sizes = [...chart.sizes];
    sizes[idx] = label;
    onChange({ ...chart, sizes });
  };

  const addSize = () => {
    const sizes = [...chart.sizes, ''];
    const values = [...chart.values, chart.measurements.map(() => '')];
    onChange({ ...chart, sizes, values });
  };

  const removeSize = (idx) => {
    const sizes = chart.sizes.filter((_, i) => i !== idx);
    const values = chart.values.filter((_, i) => i !== idx);
    onChange({ ...chart, sizes, values });
  };

  const updateValue = (sizeIdx, measureIdx, val) => {
    const values = chart.values.map(row => [...row]);
    values[sizeIdx][measureIdx] = val;
    onChange({ ...chart, values });
  };

  // Setzt die Tabelle auf die Vorlage der aktuellen Kategorie zurück (Maße-Spalten,
  // Standardgrößen, leere Werte). Bewusst manuell statt automatisch beim
  // Kategoriewechsel, damit eingegebene Maße nicht unbemerkt verloren gehen.
  const handleReset = () => {
    if (window.confirm('Größentabelle auf die Standardwerte der Kategorie zurücksetzen? Eingegebene Maße gehen verloren.')) {
      onChange(emptyChart(category));
    }
  };

  return (
    <div>
      {category && (
        <div className="flex justify-end mb-1.5">
          <button
            onClick={handleReset}
            type="button"
            className="flex items-center gap-1 text-[11px] sm-text-tape hover:text-black sm-font-label uppercase tracking-wide"
            title="Größentabelle auf die Kategorie-Vorlage zurücksetzen"
          >
            <RotateCcw size={12} /> Zurücksetzen
          </button>
        </div>
      )}
      <div className="overflow-x-auto sm-border-graph border rounded-sm sm-bg-card">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-black/5">
              <th className="p-2 text-left sm-font-label uppercase tracking-wide text-xs sm-text-ink-60 border-b sm-border-graph border-r w-24">
                Größe
              </th>
              {chart.measurements.map((m, i) => (
                <th key={i} className="p-1.5 border-b sm-border-graph border-r" style={{ minWidth: 90 }}>
                  <div className="flex items-center gap-1">
                    <input
                      value={m}
                      onChange={e => updateMeasurementLabel(i, e.target.value)}
                      className="w-full bg-transparent sm-font-label text-xs uppercase tracking-wide px-1.5 py-1 focus:bg-white/80 rounded"
                      style={{ outline: 'none' }}
                    />
                    {chart.measurements.length > 1 && (
                      <button onClick={() => removeMeasurement(i)} className="sm-icon-btn-danger shrink-0" type="button">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </th>
              ))}
              <th className="p-1 border-b sm-border-graph w-10 text-center">
                <button onClick={addMeasurement} title="Maß hinzufügen" type="button" className="sm-text-tape p-1 hover:bg-black/5 rounded">
                  <Plus size={14} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {chart.sizes.map((s, si) => (
              <tr key={si} className="hover:bg-black/[0.01]">
                <td className="p-1 border-r border-b sm-border-graph">
                  <div className="flex items-center gap-1">
                    <input
                      value={s}
                      onChange={e => updateSizeLabel(si, e.target.value)}
                      placeholder="z.B. M"
                      className="w-full bg-transparent sm-font-mono text-sm px-1.5 py-1 font-semibold focus:bg-white/80 rounded"
                      style={{ outline: 'none' }}
                    />
                    {chart.sizes.length > 1 && (
                      <button onClick={() => removeSize(si)} className="sm-icon-btn-danger shrink-0" type="button">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </td>
                {chart.measurements.map((_, mi) => (
                  <td key={mi} className="p-1 border-r border-b sm-border-graph">
                    {/* Text statt number: erlaubt Einzelwerte UND Bereiche wie "96-101" */}
                    <input
                      type="text"
                      inputMode="text"
                      value={chart.values[si] ? chart.values[si][mi] : ''}
                      onChange={e => updateValue(si, mi, e.target.value)}
                      placeholder="z. B. 96 oder 96-101"
                      className="w-full bg-transparent sm-font-mono text-sm text-right px-1.5 py-1 focus:bg-white/80 rounded"
                      style={{ outline: 'none' }}
                    />
                  </td>
                ))}
                <td className="border-b sm-border-graph"></td>
              </tr>
            ))}
            <tr>
              <td colSpan={chart.measurements.length + 2} className="p-2 bg-black/[0.02]">
                <button
                  onClick={addSize}
                  type="button"
                  className="flex items-center gap-1.5 text-xs sm-text-tape px-2 py-1 sm-font-label uppercase tracking-wide hover:bg-white border border-dashed border-gray-300 rounded transition-all"
                >
                  <Plus size={12} /> Größe hinzufügen
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
