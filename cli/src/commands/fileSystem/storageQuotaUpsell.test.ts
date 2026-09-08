import { ValidationError } from '@protontech/drive-sdk';
import { ErrorCode } from '@protontech/drive-sdk/internal/apiService/errorCodes';

import { openBrowserUrl } from '../../cli';
import type { Config } from '../../config';
import { showUpsellWhenInsufficientQuota } from './storageQuotaUpsell';
import { TransferSummary } from './transferSummary';

jest.mock('../../cli', () => ({
    openBrowserUrl: jest.fn(),
    sanitizeTerminalText: (value: string) => value,
}));

const config: Pick<Config, 'accountUrl'> = {
    accountUrl: 'account.proton.me',
};

const upsellUrl =
    'https://account.proton.me/drive/dashboard?plan=drive2022&target=compare&ref=upsell_drive_cli';

const storageQuotaError = new ValidationError('Storage quota exceeded', ErrorCode.INSUFFICIENT_SPACE);

describe('showUpsellWhenInsufficientQuota', () => {
    const openBrowserUrlMock = openBrowserUrl as jest.MockedFunction<typeof openBrowserUrl>;

    beforeEach(() => {
        openBrowserUrlMock.mockReset();
    });

    it('does nothing when there are no quota failures', () => {
        const summary = new TransferSummary('upload');
        summary.recordSuccess();
        summary.recordFailure('bad.txt', new Error('network error'));

        showUpsellWhenInsufficientQuota(config, summary, { json: false });

        expect(openBrowserUrlMock).not.toHaveBeenCalled();
    });

    it('opens the browser and prints the upsell URL on interactive uploads', () => {
        const summary = new TransferSummary('upload');
        summary.recordFailure('big.bin', storageQuotaError);
        const logSpy = jest.spyOn(console, 'log').mockImplementation();

        showUpsellWhenInsufficientQuota(config, summary, { json: false });

        expect(openBrowserUrlMock).toHaveBeenCalledWith(upsellUrl);
        expect(logSpy).toHaveBeenCalledWith(
            'You have run out of storage space. Upgrade your plan to continue uploading.',
        );
        expect(logSpy).toHaveBeenCalledWith(
            'Open following URL manually if browser did not open automatically:',
        );
        expect(logSpy).toHaveBeenCalledWith(upsellUrl);
        logSpy.mockRestore();
    });

    it('uses accountUrl from config', () => {
        const summary = new TransferSummary('upload');
        summary.recordFailure('big.bin', storageQuotaError);
        const logSpy = jest.spyOn(console, 'log').mockImplementation();
        const blackConfig: Pick<Config, 'accountUrl'> = { accountUrl: 'account.houssay.proton.black' };

        showUpsellWhenInsufficientQuota(blackConfig, summary, { json: false });

        expect(openBrowserUrlMock).toHaveBeenCalledWith(
            'https://account.houssay.proton.black/drive/dashboard?plan=drive2022&target=compare&ref=upsell_drive_cli',
        );
        logSpy.mockRestore();
    });

    it('skips upsell in json mode', () => {
        const summary = new TransferSummary('upload');
        summary.recordFailure('big.bin', storageQuotaError);

        showUpsellWhenInsufficientQuota(config, summary, { json: true });

        expect(openBrowserUrlMock).not.toHaveBeenCalled();
    });
});
