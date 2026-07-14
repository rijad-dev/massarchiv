// Schlanker Fetch-Wrapper für alle /api-Aufrufe: setzt JSON-Header, parst die
// Antwort und wirft bei Fehlern einen Error mit der Server-Fehlermeldung —
// statt dass Aufrufer still scheitern oder response.ok vergessen.

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch {
    throw new Error('Server nicht erreichbar');
  }

  if (!response.ok) {
    let message = `Serverfehler (${response.status})`;
    try {
      const err = await response.json();
      if (err.error) message = err.error;
    } catch { /* Antwort war kein JSON */ }
    throw new Error(message);
  }

  return response.json();
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
};
