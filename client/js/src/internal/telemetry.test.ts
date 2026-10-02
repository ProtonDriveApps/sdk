import { getMetricItemCreator, getMetricRecency } from './telemetry';

describe('telemetry helpers', () => {
    const now = new Date('2026-09-22T12:00:00Z');

    it.each([
        ['2026-09-01T12:00:00Z', 'past_month'],
        ['2026-08-25T12:00:00Z', 'past_month'],
        ['2026-01-01T12:00:00Z', 'past_year'],
        ['2025-10-01T12:00:00Z', 'past_year'],
        ['2024-01-01T00:00:00Z', 'since_2024'],
        ['2023-12-31T23:59:59Z', 'before_2024'],
    ] as const)('maps %s to %s recency', (creationTime, expected) => {
        expect(getMetricRecency(new Date(creationTime), now)).toBe(expected);
    });

    it('maps creation times on long months to past_month', () => {
        const march31 = new Date('2026-03-31T12:00:00Z');

        expect(getMetricRecency(new Date('2026-03-01T12:00:00Z'), march31)).toBe('past_month');
        expect(getMetricRecency(new Date('2026-02-28T12:00:00Z'), march31)).toBe('past_month');
        expect(getMetricRecency(new Date('2026-01-31T12:00:00Z'), march31)).toBe('past_year');
    });

    it.each([
        [false, false, '1p'],
        [false, true, '1p'],
        [true, true, '3p-sdk'],
        [true, false, '3p'],
    ] as const)('maps thirdParty=%s and sdk=%s to %s', (thirdParty, sdk, expected) => {
        expect(getMetricItemCreator(thirdParty, sdk)).toBe(expected);
    });
});
