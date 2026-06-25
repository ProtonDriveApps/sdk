import { ValidationError } from '../../errors';
import { AbuseCategory, ReportPublicLinkShareAbuseSettings } from '../../interface';
import { validateReportShareAbuseSettings } from './index';

describe('validateReportShareAbuseSettings', () => {
    const baseSettings: ReportPublicLinkShareAbuseSettings = {
        abuseCategory: AbuseCategory.Spam,
        bonaFide: true,
    };

    for (const abuseCategory of [AbuseCategory.Copyright, AbuseCategory.StolenData]) {
        it(`should throw when reporting ${abuseCategory} without a message`, () => {
            expect(() => validateReportShareAbuseSettings({ ...baseSettings, abuseCategory })).toThrow(ValidationError);
        });

        it(`should not throw when reporting ${abuseCategory} with a message`, () => {
            expect(() =>
                validateReportShareAbuseSettings({ ...baseSettings, abuseCategory, reporterMessage: 'message' }),
            ).not.toThrow();
        });
    }

    for (const abuseCategory of [AbuseCategory.Spam, AbuseCategory.Malware, AbuseCategory.Other]) {
        it(`should not require a message for ${abuseCategory}`, () => {
            expect(() => validateReportShareAbuseSettings({ ...baseSettings, abuseCategory })).not.toThrow();
        });
    }
});
