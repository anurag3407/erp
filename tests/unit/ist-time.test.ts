import assert from 'node:assert';
import {
  toIstDateKey,
  zonedTimeToUtc,
  istDayRange,
  addDaysToDateKey,
  enumerateDateKeys,
  isDateKeyInRange,
  daysBetweenDateKeys,
} from '../../src/index.js';

/**
 * IST day-boundary regressions (audit C3 / B5).
 *
 * The original code used `toISOString().split('T')[0]`, which keys a 02:00 IST
 * class to the previous calendar day. These cases pin the correct behaviour at
 * 00:05, 02:00 and 23:55 IST, plus UTC-midnight crossover.
 */
export async function runIstTimeTests(): Promise<void> {
  console.log('\n=== RUNNING INSTITUTIONAL TIMEZONE (IST) TESTS ===\n');

  console.log('Test T.1: Day keys around IST midnight');
  // 2025-11-03 02:00 IST === 2025-11-02 20:30 UTC
  assert.strictEqual(
    toIstDateKey(new Date('2025-11-02T20:30:00.000Z')),
    '2025-11-03',
    '02:00 IST must key to the same IST day, not the previous UTC day'
  );
  // 2025-11-03 00:05 IST === 2025-11-02 18:35 UTC
  assert.strictEqual(
    toIstDateKey(new Date('2025-11-02T18:35:00.000Z')),
    '2025-11-03',
    '00:05 IST must key to the new IST day'
  );
  // 2025-11-02 23:55 IST === 2025-11-02 18:25 UTC
  assert.strictEqual(
    toIstDateKey(new Date('2025-11-02T18:25:00.000Z')),
    '2025-11-02',
    '23:55 IST must still key to the current IST day'
  );
  // Exact IST midnight === 18:30 UTC the previous day
  assert.strictEqual(
    toIstDateKey(new Date('2025-11-02T18:30:00.000Z')),
    '2025-11-03',
    'IST midnight boundary must roll to the new day'
  );
  assert.strictEqual(
    toIstDateKey(new Date('2025-11-02T18:29:59.999Z')),
    '2025-11-02',
    'One millisecond before IST midnight must stay on the old day'
  );

  console.log('Test T.2: Local wall clock -> UTC instant');
  const twoAmIst = zonedTimeToUtc('2025-11-03', '02:00:00');
  assert.strictEqual(
    twoAmIst.toISOString(),
    '2025-11-02T20:30:00.000Z',
    '02:00 IST must convert to 20:30 UTC on the prior day'
  );
  assert.strictEqual(zonedTimeToUtc('2025-11-03').toISOString(), '2025-11-02T18:30:00.000Z', 'IST midnight must convert to 18:30 UTC');

  console.log('Test T.3: Day ranges');
  const range = istDayRange('2025-11-03');
  assert.strictEqual(range.start.toISOString(), '2025-11-02T18:30:00.000Z', 'Range start must be IST midnight');
  assert.strictEqual(
    range.endExclusive.toISOString(),
    '2025-11-03T18:30:00.000Z',
    'Range end must be the next IST midnight (exclusive)'
  );
  assert.strictEqual(
    addDaysToDateKey('2025-11-03', 1),
    '2025-11-04',
    'Adding a day must advance the date key'
  );
  assert.strictEqual(
    addDaysToDateKey('2025-12-31', 1),
    '2026-01-01',
    'Adding a day must roll the year'
  );

  console.log('Test T.4: Ranges, enumeration and comparisons');
  const days = enumerateDateKeys('2025-11-01', '2025-11-05');
  assert.strictEqual(days.length, 5, 'Inclusive enumeration must include both ends');
  assert.strictEqual(days[0], '2025-11-01', 'First enumerated key');
  assert.strictEqual(days[4], '2025-11-05', 'Last enumerated key');
  assert.deepStrictEqual(enumerateDateKeys('2025-11-05', '2025-11-01'), [], 'Reversed ranges are empty');
  assert.strictEqual(isDateKeyInRange('2025-11-03', '2025-11-01', '2025-11-05'), true, 'In-range key must match');
  assert.strictEqual(isDateKeyInRange('2025-11-06', '2025-11-01', '2025-11-05'), false, 'Out-of-range key must not match');
  assert.strictEqual(daysBetweenDateKeys('2025-11-01', '2025-11-05'), 4, 'Day difference must be exact');
  assert.strictEqual(daysBetweenDateKeys('2025-11-05', '2025-11-01'), -4, 'Day difference must be signed');

  console.log('=== ALL INSTITUTIONAL TIMEZONE TESTS PASSED (4/4) ===');
}
