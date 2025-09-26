import { Logger, ProtonDriveTelemetry } from '../interface';
import { getMockLogger } from './logger';

export function getMockTelemetry(): ProtonDriveTelemetry & { mockLogger: Logger } {
    const mockLogger = getMockLogger();

    return {
        mockLogger,
        getLogger: () => mockLogger,
        recordMetric: jest.fn(),
    };
}
