import { DeviceType } from "../../interface";
import { DriveAPIService, drivePaths } from "../apiService";
import { makeDeviceUid, makeNodeUid, splitDeviceUid } from "../uids";
import { DeviceMetadata } from "./interface";

type GetDevicesResponse = drivePaths['/drive/devices']['get']['responses']['200']['content']['application/json'];

type PostCreateDeviceRequest = Extract<drivePaths['/drive/devices']['post']['requestBody'], { 'content': object }>['content']['application/json'];
type PostCreateDeviceResponse = drivePaths['/drive/devices']['post']['responses']['200']['content']['application/json'];

type PutUpdateDeviceRequest = Extract<drivePaths['/drive/devices/{deviceID}']['put']['requestBody'], { 'content': object }>['content']['application/json'];
type PutUpdateDeviceResponse = drivePaths['/drive/devices/{deviceID}']['put']['responses']['200']['content']['application/json'];

/**
 * Provides API communication for managing devices.
 * 
 * The service is responsible for transforming local objects to API payloads
 * and vice versa. It should not contain any business logic.
 */
export class DevicesAPIService {
    constructor(private apiService: DriveAPIService) {
        this.apiService = apiService;
    }

    async getDevices(signal?: AbortSignal): Promise<DeviceMetadata[]> {
        const response = await this.apiService.get<GetDevicesResponse>('drive/devices', signal);
        return response.Devices.map((device) => ({
            uid: makeDeviceUid(device.Device.VolumeID, device.Device.DeviceID),
            type: deviceTypeNumberToEnum(device.Device.Type),
            rootFolderUid: makeNodeUid(device.Device.VolumeID, device.Share.LinkID),
            creationTime: new Date(device.Device.CreateTime*1000),
            lastSyncTime: device.Device.LastSyncTime ? new Date(device.Device.LastSyncTime*1000) : undefined,
            hasDeprecatedName: !!device.Share.Name,
            /** @deprecated to be removed once Volume-based navigation is implemented in web */
            shareId: device.Share.ShareID,
        }));
    }

    /**
     * Originally the device name was on the share of the device.
     * This was changed to be on the root node of the device instead.
     * Old devices will still have the name on the share and when
     * the client renames the device, it must be removed on the device.
     */
    async removeNameFromDevice(deviceUid: string): Promise<void> {
        const { deviceId } = splitDeviceUid(deviceUid);
        await this.apiService.put<
            // Web clients do not update Device fields, that is only for desktop clients.
            Omit<PutUpdateDeviceRequest, 'Device'>,
            PutUpdateDeviceResponse
        >(
            `drive/devices/${deviceId}`,
            {
                Share: { Name: "" },
            },
        );
    }

    async createDevice(
        device: {
            volumeId: string,
            type: DeviceType,
        },
        share: {
            addressId: string,
            addressKeyId: string,
            armoredKey: string,
            armoredSharePassphrase: string,
            armoredSharePassphraseSignature: string,
        },
        node: {
            encryptedName: string,
            armoredKey: string,
            armoredNodePassphrase: string,
            armoredNodePassphraseSignature: string,
            armoredHashKey: string,
        }
    ): Promise<DeviceMetadata> {
        const response = await this.apiService.post<PostCreateDeviceRequest, PostCreateDeviceResponse>('drive/devices', {
            // @ts-expect-error VolumeID is deprecated.
            Device: {
                Type: deviceTypeEnumToNumber(device.type),
                SyncState: 0,
            },
            // @ts-expect-error Name is deprecated.
            Share: {
                AddressID: share.addressId,
                AddressKeyID: share.addressKeyId,
                Key: share.armoredKey,
                Passphrase: share.armoredSharePassphrase,
                PassphraseSignature: share.armoredSharePassphraseSignature,
            },
            Link: {
                Name: node.encryptedName,
                NodeKey: node.armoredKey,
                NodePassphrase: node.armoredNodePassphrase,
                NodePassphraseSignature: node.armoredNodePassphraseSignature,
                NodeHashKey: node.armoredHashKey,
            }
        });

        return {
            uid: makeDeviceUid(device.volumeId, response.Device.DeviceID),
            type: device.type,
            rootFolderUid: makeNodeUid(device.volumeId, response.Device.LinkID),
            creationTime: new Date(),
            hasDeprecatedName: false,
            shareId: response.Device.ShareID,
        }
    }

    async deleteDevice(deviceUid: string): Promise<void> {
        const { deviceId } = splitDeviceUid(deviceUid);
        await this.apiService.delete(`drive/devices/${deviceId}`);
    }
}

function deviceTypeNumberToEnum(deviceType: 1 | 2 | 3): DeviceType {
    switch (deviceType) {
        case 1:
            return DeviceType.Windows;
        case 2:
            return DeviceType.MacOS;
        case 3:
            return DeviceType.Linux;
        default:
            throw new Error(`Unknown device type: ${deviceType}`);
    }
}

function deviceTypeEnumToNumber(deviceType: DeviceType): 1 | 2 | 3 {
    switch (deviceType.toLowerCase()) {
        case DeviceType.Windows.toLowerCase():
            return 1;
        case DeviceType.MacOS.toLowerCase():
            return 2;
        case DeviceType.Linux.toLowerCase():
            return 3;
        default:
            throw new Error(`Unknown device type: ${deviceType}`);
    }
}
