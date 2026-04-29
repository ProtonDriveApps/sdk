import { ParseArgsConfig } from 'util';

import { Logger, ProtonDriveClient } from '@protontech/drive-sdk';
import { Diagnostic } from '@protontech/drive-sdk/diagnostic';
import { ProtonDrivePhotosClient } from '@protontech/drive-sdk/protonDrivePhotosClient';

import { Auth } from '../api';
import { Paths } from './paths';

export interface Command {
    group: string;
    name: string;
    isAuthAction?: boolean;
    isPublicAction?: boolean;
    args?: string[];
    options?: ParseArgsConfig['options'];

    action: (args: ActionArgs) => Promise<void>;
}

export interface ActionArgs {
    logger: Logger;
    auth: Auth;
    sdk: ProtonDriveClient;
    photosSdk: ProtonDrivePhotosClient;
    sdkDiagnostic: Diagnostic;
    paths: Paths;
    args: string[];
    options: { [name: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
