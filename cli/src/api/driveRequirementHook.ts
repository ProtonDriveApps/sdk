import type { AfterResponseHook } from 'ky';

import { Logger } from '@protontech/drive-sdk';

import type { Config } from '../config';
import { processDriveRequirementHeaders, SUPPORTED_REQUIREMENT_MASK_BY_SCOPE } from './apiRequirements';
import { MessageEmitter } from './messageEmitter';

export function createDriveRequirementAfterResponseHook(config: Config, logger: Logger): AfterResponseHook {
    const driveRequirementNoticeOnce = new MessageEmitter();

    return (_request, _options, response) => {
        processDriveRequirementHeaders(response.headers, {
            clientSdkVersion: config.sdkVersion ?? '',
            supportedRequirementMasksByScope: SUPPORTED_REQUIREMENT_MASK_BY_SCOPE,
            onUnsupportedFeature: (scope, requiredMask) => {
                const message = `Update needed: unsupported feature for ${scope}`;
                driveRequirementNoticeOnce.emitOnce(message, (msg) => {
                    logger.warn(`${msg} (required feature bit mask: ${requiredMask})`);
                    process.stderr.write(msg + '\n');
                });
            },
            onRequiredUpdate: (requiredVersion) => {
                const message = `Update required: required SDK version ${requiredVersion} or newer (currently using ${config.sdkVersion ?? '0.0.1'})`;
                driveRequirementNoticeOnce.emitOnce(message, (msg) => {
                    logger.warn(msg);
                    process.stderr.write(msg + '\n');
                });
            },
            onSuggestedUpdate: (suggestedVersion) => {
                const message = `Update recommended: suggested SDK version ${suggestedVersion} or newer (currently using ${config.sdkVersion ?? '0.0.1'})`;
                driveRequirementNoticeOnce.emitOnce(message, (msg) => {
                    logger.warn(msg);
                    process.stderr.write(msg + '\n');
                });
            },
        });
    };
}
