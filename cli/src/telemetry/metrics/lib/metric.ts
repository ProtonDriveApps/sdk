import type { MetricRequest, MetricSchema } from './types';

const metricNamePattern = /^[a-zA-Z]+(?:_[a-zA-Z0-9]+)*$/;

export interface MetricsReporter {
    report(request: MetricRequest): void;
}

export abstract class Metric<D extends MetricSchema> {
    constructor(
        private readonly config: { name: string; version: number },
        private readonly reporter: MetricsReporter,
    ) {
        if (!metricNamePattern.test(config.name)) {
            throw new Error(`Invalid metric name ${config.name}`);
        }
    }

    protected addToRequestQueue(data: D) {
        this.reporter.report({
            Name: this.config.name,
            Version: this.config.version,
            Timestamp: Math.round(Date.now() / 1000),
            Data: data,
        });
    }
}
