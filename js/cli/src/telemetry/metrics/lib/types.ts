export interface MetricSchema {
    Labels: object;
    Value: number;
}

export interface MetricRequest {
    Name: string;
    Version: number;
    Timestamp: number;
    Data: object;
}
