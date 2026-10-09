import type { AfterResponseHook } from 'ky';

import { updateServerTime } from '@protontech/crypto';

/**
 * Keeps the crypto server time in sync with the API.
 *
 * Without it, keys and signatures are dated by the device clock. A device
 * clock ahead of the server produces keys from the future that the API
 * rejects as invalid.
 */
export function createServerTimeAfterResponseHook(): AfterResponseHook {
    return (_request, _options, response) => {
        const serverTime = getDateHeader(response.headers);
        if (serverTime) {
            updateServerTime(serverTime);
        }
    };
}

function getDateHeader(headers: Headers): Date | undefined {
    return parseDate(headers.get('x-pm-date')) ?? parseDate(headers.get('date'));
}

function parseDate(value: string | null): Date | undefined {
    if (!value) {
        return undefined;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
}
