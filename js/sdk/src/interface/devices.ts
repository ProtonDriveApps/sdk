import { Result } from './result';
import { InvalidNameError } from './nodes';

export type Device = {
    uid: string,
    type: DeviceType,
    name: Result<string, InvalidNameError>,
    rootFolderUid: string,
    createdDate: Date,
    lastSyncDate?: Date;
}

export enum DeviceType {
    Windows = 'Windows',
    MacOS = 'MacOS',
    Linux = 'Linux',
}

export type DeviceOrUid = Device | string;
