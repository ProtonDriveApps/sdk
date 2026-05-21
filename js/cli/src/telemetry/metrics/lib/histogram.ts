import { Metric } from './metric';
import type { MetricSchema } from './types';

export class Histogram<D extends MetricSchema> extends Metric<D> {
    observe(data: D) {
        this.addToRequestQueue(data);
    }
}
