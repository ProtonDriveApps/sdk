import { Result } from './result';

export type Device = {
    uid: string,
    name: Result<string, Error>,
    rootFolderUid: string,
}

export type DeviceOrUid = Device | string;

export interface Devices {
    iterateDevices(signal?: AbortSignal): AsyncGenerator<Device>,
    createDevice(name: string): Promise<Device>,
    renameDevice(deviceOrUid: DeviceOrUid, name: string): Promise<Device>,
    deleteDevice(deviceOrUid: DeviceOrUid): Promise<void>,
}
