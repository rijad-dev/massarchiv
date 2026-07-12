// Bild-Utilities: Client-seitiges Downscaling (kein sharp/multer auf dem Server nötig),
// Persistierung (Upload im SQLite-Modus, dataURL im Browser-Modus) und Base64-Zugriff
// für die Vision-Extraktion.

import { uid } from './helpers';

// Verkleinert eine Bilddatei per Canvas und liefert ein In-Memory-Bildobjekt.
// Im localStorage-Modus (5-MB-Quota) stärker komprimieren: maxDim 800, quality 0.7.
export async function downscaleImage(file, maxDim = 1600, quality = 0.85) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return {
    id: uid(),
    kind: 'sonstiges',
    mimeType: 'image/jpeg',
    dataUrl,
    base64: dataUrl.split(',')[1]
  };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Bild konnte nicht gelesen werden'));
    reader.readAsDataURL(file);
  });
}

// Bereitet ein Bild doppelt auf:
// - Speicher-Variante (verkleinert, JPEG) für Upload/Anzeige
// - Extraktions-Variante in Originalqualität für die Vision-KI — Größentabellen
//   brauchen die volle Auflösung, sonst geht die Zeilen-/Spaltenstruktur verloren.
//   Originaldatei bis 4 MB wird unverändert übergeben (identisch zum Terminal-Test),
//   größere Dateien werden schonend auf 2048 px / Qualität 0.92 gerendert.
export async function prepareImage(file, storageMode) {
  const isLocalMode = storageMode !== 'sqlite';
  const storage = await (isLocalMode ? downscaleImage(file, 800, 0.7) : downscaleImage(file, 1600, 0.85));

  let extractMimeType;
  let extractBase64;
  const supportedOriginal = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
  if (supportedOriginal && file.size <= 4 * 1024 * 1024) {
    const dataUrl = await fileToDataUrl(file);
    extractMimeType = file.type;
    extractBase64 = dataUrl.split(',')[1];
  } else {
    const hiRes = await downscaleImage(file, 2048, 0.92);
    extractMimeType = hiRes.mimeType;
    extractBase64 = hiRes.base64;
  }

  return { ...storage, extractMimeType, extractBase64 };
}

// Persistiert eine gemischte Bildliste (bereits gespeicherte {url} + neue In-Memory-Bilder)
// und liefert speicherfertige Referenzen [{id, url, kind}].
export async function persistImages(images, storageMode) {
  const out = [];
  for (const img of images) {
    // Bereits persistiert (Server-URL oder — im Browser-Modus — dataURL)
    if (img.url && (storageMode !== 'sqlite' || !img.url.startsWith('data:'))) {
      out.push({ id: img.id, url: img.url, kind: img.kind || 'sonstiges' });
      continue;
    }

    const dataUrl = img.dataUrl || img.url;
    if (!dataUrl) continue;

    if (storageMode === 'sqlite') {
      const response = await fetch('/api/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: img.base64 || dataUrl.split(',')[1],
          mimeType: img.mimeType || 'image/jpeg'
        })
      });
      if (!response.ok) {
        let message = 'Bild-Upload fehlgeschlagen';
        try {
          const err = await response.json();
          if (err.error) message = err.error;
        } catch { /* keine JSON-Antwort */ }
        throw new Error(message);
      }
      const { url } = await response.json();
      out.push({ id: img.id, url, kind: img.kind || 'sonstiges' });
    } else {
      out.push({ id: img.id, url: dataUrl, kind: img.kind || 'sonstiges' });
    }
  }
  return out;
}

// Liefert {mimeType, data} (Base64 ohne Prefix) für die Vision-Extraktion —
// bevorzugt die hochauflösende Extraktions-Variante, sonst Speicher-Variante,
// sonst Fetch der bereits hochgeladenen Datei (same-origin).
export async function imageToBase64(img) {
  if (img.extractBase64) return { mimeType: img.extractMimeType || 'image/jpeg', data: img.extractBase64 };
  if (img.base64) return { mimeType: img.mimeType || 'image/jpeg', data: img.base64 };

  const src = img.dataUrl || img.url;
  if (src.startsWith('data:')) {
    return {
      mimeType: src.slice(5, src.indexOf(';')) || 'image/jpeg',
      data: src.split(',')[1]
    };
  }

  const blob = await (await fetch(src)).blob();
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Bild konnte nicht gelesen werden'));
    reader.readAsDataURL(blob);
  });
  return { mimeType: blob.type || 'image/jpeg', data: dataUrl.split(',')[1] };
}
