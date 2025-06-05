import { c } from 'ttag';

import { ValidationError } from '../../errors';
import { Device, DeviceType, Logger, resultOk } from '../../interface';
import { DevicesAPIService } from './apiService';
import { DevicesCryptoService } from './cryptoService';
import { DeviceMetadata, NodesManagementService, NodesService, SharesService } from './interface';

export class DevicesManager {
    constructor(
        private logger: Logger,
        private apiService: DevicesAPIService,
        private cryptoService: DevicesCryptoService,
        private sharesService: SharesService,
        private nodesService: NodesService,
        private nodesManagementService: NodesManagementService,
    ) {
        this.logger = logger;
        this.apiService = apiService;
        this.cryptoService = cryptoService;
        this.sharesService = sharesService;
        this.nodesService = nodesService;
        this.nodesManagementService = nodesManagementService;
    }

    async *iterateDevices(signal?: AbortSignal): AsyncGenerator<Device> {
        const devices = await this.apiService.getDevices(signal);

        const nodeUidToDevice = new Map<string, DeviceMetadata>();
        for (const device of devices) {
            nodeUidToDevice.set(device.rootFolderUid, device);
        }

        for await (const node of this.nodesService.iterateNodes(Array.from(nodeUidToDevice.keys()), signal)) {
            if ('missingUid' in node) {
                continue;
            }

            const device = nodeUidToDevice.get(node.uid);
            if (device) {
                yield {
                    ...device,
                    name: node.name,
                };
            }
        }
    }

    async createDevice(name: string, deviceType: DeviceType): Promise<Device> {
        const { volumeId } = await this.sharesService.getMyFilesIDs();
        const { address, shareKey, node } = await this.cryptoService.createDevice(name);

        const device = await this.apiService.createDevice(
            {
                volumeId,
                type: deviceType,
            },
            {
                addressId: address.addressId,
                addressKeyId: address.addressKeyId,
                armoredKey: shareKey.armoredKey,
                armoredSharePassphrase: shareKey.armoredPassphrase,
                armoredSharePassphraseSignature: shareKey.armoredPassphraseSignature,
            },
            {
                encryptedName: node.encryptedName,
                armoredKey: node.key.armoredKey,
                armoredNodePassphrase: node.key.armoredPassphrase,
                armoredNodePassphraseSignature: node.key.armoredPassphraseSignature,
                armoredHashKey: node.armoredHashKey,
            },
        );
        return {
            ...device,
            name: resultOk(name),
        };
    }

    async renameDevice(deviceUid: string, name: string): Promise<Device> {
        const device = await this.getDeviceMetadata(deviceUid);

        if (device.hasDeprecatedName) {
            this.logger.info("Removing deprecated name from device");
            try {
                await this.apiService.removeNameFromDevice(deviceUid);
            } catch (error: unknown) {
                this.logger.error('Failed to remove name from device', error);
            }
        }

        await this.nodesManagementService.renameNode(device.rootFolderUid, name, {
            allowRenameRootNode: true,
        });

        return {
            ...device,
            name: resultOk(name),
        }
    }

    private async getDeviceMetadata(deviceUid: string): Promise<DeviceMetadata> {
        const devices = await this.apiService.getDevices();
        const device = devices.find(device => device.uid === deviceUid);
        if (!device) {
            throw new ValidationError(c('Error').t`Device not found`);
        }
        return device;
    }

    async deleteDevice(deviceUid: string): Promise<void> {
        await this.apiService.deleteDevice(deviceUid);
    }
}
