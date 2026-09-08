import { ErrorCode } from '@protontech/drive-sdk/internal/apiService/errorCodes';

import { openBrowserUrl, sanitizeTerminalText } from '../../cli';
import type { Config } from '../../config';
import { TransferSummary } from './transferSummary';

const STORAGE_QUOTA_ERROR_CODES = new Set([
    ErrorCode.INSUFFICIENT_QUOTA,
    ErrorCode.INSUFFICIENT_SPACE,
    ErrorCode.INSUFFICIENT_VOLUME_QUOTA,
    ErrorCode.INSUFFICIENT_DEVICE_QUOTA,
]);

type StorageQuotaUpsellConfig = Pick<Config, 'accountUrl'>;

export function showUpsellWhenInsufficientQuota(
    config: StorageQuotaUpsellConfig,
    summary: TransferSummary,
    options: { json: boolean },
): void {
    if (options.json || !summary.hasFailureWithErrorCode(STORAGE_QUOTA_ERROR_CODES)) {
        return;
    }

    const upsellUrl = getStorageQuotaUpsellUrl(config);
    openBrowserUrl(upsellUrl);
    console.log('You have run out of storage space. Upgrade your plan to continue uploading.');
    console.log('Open following URL manually if browser did not open automatically:');
    console.log(sanitizeTerminalText(upsellUrl));
}

function getStorageQuotaUpsellUrl(config: StorageQuotaUpsellConfig): string {
    return `https://${config.accountUrl}/drive/dashboard?plan=drive2022&target=compare&ref=upsell_drive_cli`;
}
