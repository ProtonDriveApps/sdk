import { ParseArgsOptionDescriptor } from 'util';

import { Logger, ProtonDriveClient } from '@protontech/drive-sdk';
import { Diagnostic } from '@protontech/drive-sdk/diagnostic';
import { ProtonDrivePhotosClient } from '@protontech/drive-sdk/protonDrivePhotosClient';

import { Auth } from '../api';
import type { Manager } from '../events';
import type { CliMetrics } from '../telemetry';
import { Paths } from './paths';

export interface Command {
    group: string;
    name: string;
    help?: string;
    isAuthAction?: boolean;
    isPublicAction?: boolean;
    args?: string[];
    options?: Options;

    action: (args: ActionArgs) => Promise<void>;
}

export interface Options {
    [longOption: string]: Option;
}

export type Option = ParseArgsOptionDescriptor & {
    allowedValues?: string[];
    help?: string;
};

export interface ActionArgs {
    logger: Logger;
    auth: Auth;
    sdk: ProtonDriveClient;
    photosSdk: ProtonDrivePhotosClient;
    sdkDiagnostic: Diagnostic;
    paths: Paths;
    eventsManager: Manager;
    metrics?: CliMetrics;
    clearCaches: () => Promise<void>;
    args: string[];
    options: { [name: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
