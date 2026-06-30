import { c } from 'ttag';

import { ValidationError } from '../../errors';
import { AbuseCategory, ReportPublicLinkShareAbuseSettings } from '../../interface';

export function validateReportShareAbuseSettings(settings: ReportPublicLinkShareAbuseSettings): void {
    const requiresMessage =
        settings.abuseCategory === AbuseCategory.Copyright || settings.abuseCategory === AbuseCategory.StolenData;
    if (requiresMessage && !settings.reporterMessage) {
        throw new ValidationError(
            c('Error').t`A message is required when reporting copyright infringement or stolen data`,
        );
    }
}
