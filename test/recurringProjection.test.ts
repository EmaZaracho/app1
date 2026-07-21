import { firstNegativeDate, summarizeMonth } from '../src/recurring/recurringProjection';
import type { OccurrenceSummaryInput } from '../src/recurring/recurringProjection';

function occ(overrides: Partial<OccurrenceSummaryInput>): OccurrenceSummaryInput {
  return { effectiveStatus: 'pending', projectedAmount: 1000, paidActualAmount: null, ...overrides };
}

describe('summarizeMonth', () => {
  it('separa pagado real, pendiente proyectado y posible total', () => {
    const s = summarizeMonth([
      occ({ effectiveStatus: 'paid', paidActualAmount: 5000 }),
      occ({ effectiveStatus: 'pending', projectedAmount: 2000 }),
      occ({ effectiveStatus: 'overdue', projectedAmount: 1000 }),
    ]);
    expect(s.paidActualTotal).toBe(5000);
    expect(s.pendingProjectedKnownTotal).toBe(3000);
    expect(s.possibleMonthTotal).toBe(8000);
  });

  it('los importes desconocidos se cuentan aparte y no se suman', () => {
    const s = summarizeMonth([
      occ({ effectiveStatus: 'pending', projectedAmount: null }),
      occ({ effectiveStatus: 'overdue', projectedAmount: null }),
      occ({ effectiveStatus: 'pending', projectedAmount: 1000 }),
    ]);
    expect(s.unknownPendingCount).toBe(2);
    expect(s.pendingProjectedKnownTotal).toBe(1000);
  });

  it('skipped y cancelled se excluyen de proyecciones y se cuentan', () => {
    const s = summarizeMonth([
      occ({ effectiveStatus: 'skipped', projectedAmount: 9999 }),
      occ({ effectiveStatus: 'cancelled', projectedAmount: 9999 }),
      occ({ effectiveStatus: 'pending', projectedAmount: 1000 }),
    ]);
    expect(s.skippedCount).toBe(1);
    expect(s.cancelledCount).toBe(1);
    expect(s.pendingProjectedKnownTotal).toBe(1000);
    expect(s.possibleMonthTotal).toBe(1000);
  });
});

describe('firstNegativeDate', () => {
  it('devuelve null si el saldo alcanza', () => {
    expect(
      firstNegativeDate(10000, [
        { scheduledDate: '2026-08-05', projectedAmount: 3000 },
        { scheduledDate: '2026-08-20', projectedAmount: 4000 },
      ])
    ).toBeNull();
  });

  it('devuelve la primera fecha en que queda negativo (ordenando por fecha)', () => {
    expect(
      firstNegativeDate(5000, [
        { scheduledDate: '2026-08-20', projectedAmount: 4000 },
        { scheduledDate: '2026-08-05', projectedAmount: 3000 },
      ])
    ).toBe('2026-08-20');
  });
});
