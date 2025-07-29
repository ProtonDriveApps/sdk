import { Device, DeviceType, Logger } from '../../interface';
import { ValidationError } from '../../errors';
import { getMockLogger } from '../../tests/logger';
import { DevicesAPIService } from './apiService';
import { DevicesCryptoService } from './cryptoService';
import { SharesService, NodesService, NodesManagementService, DeviceMetadata } from './interface';
import { DevicesManager } from './manager';

describe('DevicesManager', () => {
    let logger: Logger;
    let apiService: jest.Mocked<DevicesAPIService>;
    let cryptoService: jest.Mocked<DevicesCryptoService>;
    let sharesService: jest.Mocked<SharesService>;
    let nodesService: jest.Mocked<NodesService>;
    let nodesManagementService: jest.Mocked<NodesManagementService>;
    let manager: DevicesManager;

    beforeEach(() => {
        logger = getMockLogger();
        // @ts-expect-error No need to implement all methods for mocking
        apiService = {
            createDevice: jest.fn(),
            getDevices: jest.fn(),
            removeNameFromDevice: jest.fn(),
            deleteDevice: jest.fn(),
        };
        // @ts-expect-error No need to implement all methods for mocking
        cryptoService = {
            createDevice: jest.fn(),
        };
        // @ts-expect-error No need to implement all methods for mocking
        sharesService = {
            getMyFilesIDs: jest.fn(),
        };
        // @ts-expect-error No need to implement all methods for mocking
        nodesService = {};
        nodesManagementService = {
            renameNode: jest.fn(),
        };

        manager = new DevicesManager(
            logger,
            apiService,
            cryptoService,
            sharesService,
            nodesService,
            nodesManagementService,
        );
    });

    it('creates device', async () => {
        const volumeId = 'volume123';
        const name = 'Test Device';
        const deviceType = DeviceType.Linux;
        const address = { addressId: 'address123', addressKeyId: 'key123' };
        const shareKey = {
            armoredKey: 'armoredKey',
            armoredPassphrase: 'passphrase',
            armoredPassphraseSignature: 'signature',
        };
        const node = {
            encryptedName: 'encryptedName',
            key: {
                armoredKey: 'nodeKey',
                armoredPassphrase: 'nodePassphrase',
                armoredPassphraseSignature: 'nodeSignature',
            },
            armoredHashKey: 'hashKey',
        };
        const createdDevice = {
            uid: 'device123',
            rootFolderUid: 'rootFolder123',
            type: deviceType,
            shareId: 'shareid',
        } as DeviceMetadata;

        sharesService.getMyFilesIDs.mockResolvedValue({ volumeId });
        cryptoService.createDevice.mockResolvedValue({ address, shareKey, node });
        apiService.createDevice.mockResolvedValue(createdDevice);

        const result = await manager.createDevice(name, deviceType);

        expect(sharesService.getMyFilesIDs).toHaveBeenCalled();
        expect(cryptoService.createDevice).toHaveBeenCalledWith(name);
        expect(apiService.createDevice).toHaveBeenCalledWith(
            { volumeId, type: deviceType },
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
        expect(result).toEqual({ ...createdDevice, name: { ok: true, value: name } });
    });

    it('renames device with deprecated name', async () => {
        const deviceUid = 'device123';
        const name = 'New Device Name';
        const device = {
            uid: deviceUid,
            rootFolderUid: 'rootFolder123',
            hasDeprecatedName: true,
            shareId: 'shareid',
        } as DeviceMetadata;

        apiService.getDevices.mockResolvedValue([device]);

        const result = await manager.renameDevice(deviceUid, name);

        expect(apiService.getDevices).toHaveBeenCalled();
        expect(apiService.removeNameFromDevice).toHaveBeenCalledWith(deviceUid);
        expect(nodesManagementService.renameNode).toHaveBeenCalledWith(device.rootFolderUid, name, {
            allowRenameRootNode: true,
        });
        expect(result).toEqual({ ...device, name: { ok: true, value: name } });
    });

    it('renames device without deprecated name', async () => {
        const deviceUid = 'device123';
        const name = 'New Device Name';
        const device = {
            uid: deviceUid,
            rootFolderUid: 'rootFolder123',
            hasDeprecatedName: false,
            shareId: 'shareid',
        } as DeviceMetadata;

        apiService.getDevices.mockResolvedValue([device]);

        const result = await manager.renameDevice(deviceUid, name);

        expect(apiService.getDevices).toHaveBeenCalled();
        expect(apiService.removeNameFromDevice).not.toHaveBeenCalled();
        expect(nodesManagementService.renameNode).toHaveBeenCalledWith(device.rootFolderUid, name, {
            allowRenameRootNode: true,
        });
        expect(result).toEqual({ ...device, name: { ok: true, value: name } });
    });

    it('renames non-existing device', async () => {
        const deviceUid = 'nonexistentDevice';
        const name = 'New Device Name';

        apiService.getDevices.mockResolvedValue([]);

        await expect(manager.renameDevice(deviceUid, name)).rejects.toThrow(ValidationError);
        expect(apiService.getDevices).toHaveBeenCalled();
        expect(apiService.removeNameFromDevice).not.toHaveBeenCalled();
        expect(nodesManagementService.renameNode).not.toHaveBeenCalled();
    });
});
