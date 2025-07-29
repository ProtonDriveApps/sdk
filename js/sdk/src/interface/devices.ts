import { Result } from './result';
import { InvalidNameError } from './nodes';

export type Device = {
    uid: string;
    type: DeviceType;
    name: Result<string, Error | InvalidNameError>;
    rootFolderUid: string;
    creationTime: Date;
    lastSyncDate?: Date;
    /** @deprecated to be removed once Volume-based navigation is implemented in web */
    shareId: string;
};

export enum DeviceType {
    Windows = 'Windows',
    MacOS = 'MacOS',
    Linux = 'Linux',
}

export type DeviceOrUid = Device | string;
