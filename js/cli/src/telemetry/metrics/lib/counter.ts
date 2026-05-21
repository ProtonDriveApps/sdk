import { Metric } from './metric';
import type { MetricSchema } from './types';

export class Counter<D extends MetricSchema> extends Metric<D> {
    increment(labels: D['Labels'], value = 1) {
        this.addToRequestQueue({
            Value: value,
            Labels: labels,
        } as D);
    }
}
