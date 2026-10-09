import { updateServerTime } from '@protontech/crypto';

import { createServerTimeAfterResponseHook } from './serverTimeHook';

jest.mock('@protontech/crypto', () => ({
    updateServerTime: jest.fn(),
}));

async function callHook(headers: Record<string, string>) {
    const hook = createServerTimeAfterResponseHook();
    const response = new Response(null, { headers });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await hook(new Request('https://example.com'), {} as any, response, {} as any);
}

describe('createServerTimeAfterResponseHook', () => {
    beforeEach(() => {
        jest.mocked(updateServerTime).mockClear();
    });

    it('updates server time from the custom date header', async () => {
        await callHook({ 'x-pm-date': 'Fri, 09 Oct 2026 06:00:00 GMT', date: 'Fri, 09 Oct 2026 05:00:00 GMT' });

        expect(updateServerTime).toHaveBeenCalledWith(new Date('2026-10-09T06:00:00Z'));
    });

    it('falls back to the standard date header', async () => {
        await callHook({ date: 'Fri, 09 Oct 2026 05:00:00 GMT' });

        expect(updateServerTime).toHaveBeenCalledWith(new Date('2026-10-09T05:00:00Z'));
    });

    it('falls back to the standard date header when the custom one is invalid', async () => {
        await callHook({ 'x-pm-date': 'invalid', date: 'Fri, 09 Oct 2026 05:00:00 GMT' });

        expect(updateServerTime).toHaveBeenCalledWith(new Date('2026-10-09T05:00:00Z'));
    });

    it('does not update server time without a valid date header', async () => {
        await callHook({ date: 'invalid' });

        expect(updateServerTime).not.toHaveBeenCalled();
    });
});
