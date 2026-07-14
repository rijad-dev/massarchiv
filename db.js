import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'wardrobe.db');

let db = null;

export async function getDb() {
  if (db) return db;
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // WAL-Journaling: schützt die einzige Datenkopie vor Korruption, falls der
  // Prozess mitten in einem Schreibvorgang beendet wird.
  await db.exec('PRAGMA journal_mode=WAL;');

  // Create tables for wardrobe garments and analysis history
  await db.exec(`
    CREATE TABLE IF NOT EXISTS wardrobe (
      id TEXT PRIMARY KEY,
      data TEXT
    );
    CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      date TEXT,
      data TEXT
    );
    CREATE TABLE IF NOT EXISTS profile (
      id TEXT PRIMARY KEY,
      data TEXT
    );
  `);

  return db;
}

export async function getWardrobe() {
  const database = await getDb();
  const rows = await database.all('SELECT data FROM wardrobe');
  return rows.map(r => JSON.parse(r.data));
}

export async function saveGarment(garment) {
  const database = await getDb();
  await database.run(
    'INSERT OR REPLACE INTO wardrobe (id, data) VALUES (?, ?)',
    garment.id,
    JSON.stringify(garment)
  );
  return garment;
}

export async function deleteGarment(id) {
  const database = await getDb();
  await database.run('DELETE FROM wardrobe WHERE id = ?', id);
  return { id };
}

export async function getHistory() {
  const database = await getDb();
  const rows = await database.all('SELECT data FROM history ORDER BY date DESC');
  return rows.map(r => JSON.parse(r.data));
}

export async function saveHistoryEntry(entry) {
  const database = await getDb();
  await database.run(
    'INSERT OR REPLACE INTO history (id, date, data) VALUES (?, ?, ?)',
    entry.id,
    entry.date,
    JSON.stringify(entry)
  );
  return entry;
}

export async function deleteHistoryEntry(id) {
  const database = await getDb();
  await database.run('DELETE FROM history WHERE id = ?', id);
  return { id };
}

export async function clearHistory() {
  const database = await getDb();
  await database.run('DELETE FROM history');
  return { cleared: true };
}

export async function getProfile() {
  const database = await getDb();
  const row = await database.get("SELECT data FROM profile WHERE id = 'me'");
  return row ? JSON.parse(row.data) : null;
}

export async function saveProfile(profile) {
  const database = await getDb();
  await database.run(
    "INSERT OR REPLACE INTO profile (id, data) VALUES ('me', ?)",
    JSON.stringify(profile)
  );
  return profile;
}

// Kappt den Verlauf auf die neuesten `limit` Einträge (analog zum Frontend-Limit).
export async function pruneHistory(limit = 50) {
  const database = await getDb();
  const result = await database.run(
    'DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY date DESC LIMIT ?)',
    limit
  );
  return { deleted: result.changes || 0 };
}

// Schließt die Verbindung (für sauberes Herunterfahren in server.js).
export async function closeDb() {
  if (!db) return;
  const database = db;
  db = null;
  await database.close();
}
