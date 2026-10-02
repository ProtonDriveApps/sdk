import { MetricItemCreator, MetricItemRecency } from '../interface';

export function getMetricRecency(creationTime: Date, now = new Date()): MetricItemRecency {
    const pastMonth = new Date(now);
    const pastMonthDay = pastMonth.getUTCDate();
    pastMonth.setUTCMonth(pastMonth.getUTCMonth() - 1);
    if (pastMonth.getUTCDate() !== pastMonthDay) {
        pastMonth.setUTCDate(0);
    }
    if (creationTime >= pastMonth) {
        return 'past_month';
    }

    const pastYear = new Date(now);
    pastYear.setUTCFullYear(pastYear.getUTCFullYear() - 1);
    if (creationTime >= pastYear) {
        return 'past_year';
    }

    if (creationTime >= new Date('2024-01-01')) {
        return 'since_2024';
    }

    return 'before_2024';
}

export function getMetricItemCreator(thirdParty?: boolean, sdk?: boolean): MetricItemCreator | undefined {
    if (thirdParty === undefined) {
        return undefined;
    }
    if (!thirdParty) {
        return '1p';
    }
    return sdk ? '3p-sdk' : '3p';
}
