import { describe, it, expect } from 'vitest';
import { daysLeftInTrash, isTrashExpired, TRASH_RETENTION_DAYS } from '../src/utils/helpers.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// Fester Bezugszeitpunkt: die Helfer nehmen `now` als Parameter, daher braucht
// kein Test die echte Uhr oder Zeit-Mocking.
const NOW = Date.UTC(2026, 0, 31);
const deletedDaysAgo = (days) => new Date(NOW - days * DAY_MS).toISOString();

describe('TRASH_RETENTION_DAYS', () => {
  it('beträgt 30 Tage', () => {
    expect(TRASH_RETENTION_DAYS).toBe(30);
  });
});

describe('daysLeftInTrash', () => {
  it('frisch gelöscht → volle 30 Tage', () => {
    expect(daysLeftInTrash(deletedDaysAgo(0), NOW)).toBe(30);
  });

  it('vor 10 Tagen gelöscht → 20 Tage übrig', () => {
    expect(daysLeftInTrash(deletedDaysAgo(10), NOW)).toBe(20);
  });

  it('wird nie negativ (längst abgelaufen)', () => {
    expect(daysLeftInTrash(deletedDaysAgo(40), NOW)).toBe(0);
  });

  it('ungültiges oder fehlendes Datum → volle Frist als Fallback', () => {
    expect(daysLeftInTrash(undefined, NOW)).toBe(TRASH_RETENTION_DAYS);
    expect(daysLeftInTrash('kein-datum', NOW)).toBe(TRASH_RETENTION_DAYS);
  });
});

describe('isTrashExpired', () => {
  it('vor 29 Tagen → noch nicht abgelaufen', () => {
    expect(isTrashExpired(deletedDaysAgo(29), NOW)).toBe(false);
  });

  it('nach genau 30 Tagen → abgelaufen', () => {
    expect(isTrashExpired(deletedDaysAgo(30), NOW)).toBe(true);
  });

  it('vor 31 Tagen → abgelaufen', () => {
    expect(isTrashExpired(deletedDaysAgo(31), NOW)).toBe(true);
  });

  it('ungültiges Datum gilt bewusst NICHT als abgelaufen (lieber behalten)', () => {
    expect(isTrashExpired('kein-datum', NOW)).toBe(false);
    expect(isTrashExpired(undefined, NOW)).toBe(false);
  });
});
