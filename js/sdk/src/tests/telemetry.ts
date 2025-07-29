import { ProtonDriveTelemetry } from '../interface';
import { getMockLogger } from './logger';

export function getMockTelemetry(): ProtonDriveTelemetry {
    return {
        getLogger: getMockLogger,
        logEvent: jest.fn(),
    };
}
