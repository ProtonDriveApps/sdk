import { ParseArgsConfig } from 'util';
import { ProtonDriveClient } from '../../../sdk/src';
import { ProtonDrivePhotosClient } from '../../../sdk/src/protonDrivePhotosClient';
import { Diagnostic } from '../../../sdk/src/diagnostic';
import { Account } from '../account/account';
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
    account: Account;
    sdk: ProtonDriveClient;
    photosSdk: ProtonDrivePhotosClient;
    sdkDiagnostic: Diagnostic;
    paths: Paths;
    args: string[];
    options: { [name: string]: unknown };
}
