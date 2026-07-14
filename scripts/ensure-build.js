// Läuft automatisch vor `npm start` (prestart): baut das Frontend genau dann,
// wenn noch kein Build existiert — damit ein frischer Clone mit
// `npm install && npm start` direkt eine funktionierende App bekommt.
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

if (!existsSync(path.join(root, 'dist', 'index.html'))) {
  console.log('Kein Frontend-Build gefunden — baue das Frontend einmalig…');
  const { build } = await import('vite');
  await build({ root });
}
