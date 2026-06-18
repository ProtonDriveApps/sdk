import type { KyInstance } from 'ky';

import { METRICS_BATCH_SIZE, METRICS_MAX_JAIL, METRICS_REQUEST_FREQUENCY_MS } from '../constants';
import type { MetricRequest } from './types';

export class MetricsRequestService {
    private readonly queue: MetricRequest[] = [];
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private jailCount = 0;

    constructor(
        private readonly authenticatedRequest: KyInstance,
        private readonly metricsUrl: string,
    ) {}

    report(request: MetricRequest) {
        if (this.isJailed()) {
            return;
        }

        if (this.intervalId === null) {
            this.intervalId = setInterval(() => {
                void this.processNextBatch();
            }, METRICS_REQUEST_FREQUENCY_MS);
        }

        this.queue.push(request);
    }

    async processAllRequests() {
        if (this.queue.length === 0) {
            return;
        }

        const items = this.queue.splice(0);
        await this.send(items);
    }

    private async processNextBatch() {
        if (this.queue.length === 0) {
            this.stopBatching();
            return;
        }

        const items = this.queue.splice(0, METRICS_BATCH_SIZE);
        await this.send(items);
    }

    private stopBatching() {
        if (this.intervalId !== null) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    private isJailed() {
        return this.jailCount >= METRICS_MAX_JAIL;
    }

    private async send(metrics: MetricRequest[]) {
        if (metrics.length === 0 || this.isJailed()) {
            return;
        }

        try {
            const response = await this.authenticatedRequest.post(this.metricsUrl, {
                json: { Metrics: metrics },
                throwHttpErrors: false,
            });

            if (response.ok) {
                this.jailCount = 0;
                return;
            }

            this.jailCount += 1;
        } catch {
            this.jailCount += 1;
        }
    }
}
