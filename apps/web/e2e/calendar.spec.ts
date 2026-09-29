import { test, expect } from '@playwright/test';
import { parseDate, formatDate } from '../src/lib/calendar';
test('Brazilian UI date boundary preserves ISO API dates', () => {
  expect(parseDate('2026/09/28')).toBe('2026-09-28');
  expect(formatDate('2026-09-28')).toBe('2026/09/28');
  expect(parseDate('2024/02/29')).toBe('2024-02-29');
  for (const input of ['2025/02/29','2026/04/31','2026/13/01','28/09/2026','2026-09-28']) expect(() => parseDate(input)).toThrow();
});
