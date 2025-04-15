import { DriveAPIService, drivePaths } from "../apiService";
import { makeMemberUid } from "../uids";
import { EncryptedShare, EncryptedRootShare, EncryptedShareCrypto, ShareType } from "./interface";

type PostCreateVolumeRequest = Extract<drivePaths['/drive/volumes']['post']['requestBody'], { 'content': object }>['content']['application/json'];
type PostCreateVolumeResponse = drivePaths['/drive/volumes']['post']['responses']['200']['content']['application/json'];

type PostCreateShareRequest = Extract<drivePaths['/drive/volumes/{volumeID}/shares']['post']['requestBody'], { 'content': object }>['content']['application/json'];
type PostCreateShareResponse = drivePaths['/drive/volumes/{volumeID}/shares']['post']['responses']['200']['content']['application/json'];

type GetMyFilesResponse = drivePaths['/drive/v2/shares/my-files']['get']['responses']['200']['content']['application/json'];
type GetVolumeResponse = drivePaths['/drive/volumes/{volumeID}']['get']['responses']['200']['content']['application/json'];
type GetShareResponse = drivePaths['/drive/shares/{shareID}']['get']['responses']['200']['content']['application/json'];

/**
 * Provides API communication for fetching shares and creating volumes.
 * 
 * The service is responsible for transforming local objects to API payloads
 * and vice versa. It should not contain any business logic.
 */
export class SharesAPIService {
    constructor(private apiService: DriveAPIService) {
        this.apiService = apiService;
    }

    async getMyFiles(): Promise<EncryptedRootShare> {
        const response = await this.apiService.get<GetMyFilesResponse>('drive/v2/shares/my-files');
        return {
            volumeId: response.Volume.VolumeID,
            shareId: response.Share.ShareID,
            rootNodeId: response.Link.Link.LinkID,
            creatorEmail: response.Share.CreatorEmail,
            encryptedCrypto: {
                armoredKey: response.Share.Key,
                armoredPassphrase: response.Share.Passphrase,
                armoredPassphraseSignature: response.Share.PassphraseSignature,
            },
            addressId: response.Share.AddressID,
            type: ShareType.Main,
        };
    }

    async getVolume(volumeId: string): Promise<{ shareId: string }> {
        const response = await this.apiService.get<GetVolumeResponse>(`drive/volumes/${volumeId}`);
        return {
            shareId: response.Volume.Share.ShareID,
        }
    }

    async getShare(shareId: string): Promise<EncryptedShare> {
        const response = await this.apiService.get<GetShareResponse>(`drive/shares/${shareId}`);
        return convertSharePayload(response);
    }

    /**
     * Returns root share with address key.
     * 
     * This function provides access to root shares that provides access
     * to node tree via address key. For this reason, caller must use this
     * only when it is clear the shareId is root share.
     * 
     * @throws Error when share is not root share.
     */
    async getRootShare(shareId: string): Promise<EncryptedRootShare> {
        const response = await this.apiService.get<GetShareResponse>(`drive/shares/${shareId}`);

        if (!response.AddressID) {
            throw new Error('Loading share without direct access is not supported');
        }

        return {
            ...convertSharePayload(response),
            addressId: response.AddressID,
        };
    }

    async createVolume(
        share: {
            addressId: string,
            addressKeyId: string,
        } & EncryptedShareCrypto,
        node: {
            encryptedName: string,
            armoredKey: string,
            armoredPassphrase: string,
            armoredPassphraseSignature: string,
            armoredHashKey: string,
        },
    ): Promise<{ volumeId: string, shareId: string, rootNodeId: string }> {
        const response = await this.apiService.post<
            // Volume & share names are deprecated.
            Omit<PostCreateVolumeRequest, 'VolumeName' | 'ShareName'>,
            PostCreateVolumeResponse
        >('drive/volumes', {
            AddressID: share.addressId,
            AddressKeyID: share.addressKeyId,
            ShareKey: share.armoredKey,
            SharePassphrase: share.armoredPassphrase,
            SharePassphraseSignature: share.armoredPassphraseSignature,

            FolderName: node.encryptedName,
            FolderKey: node.armoredKey,
            FolderPassphrase: node.armoredPassphrase,
            FolderPassphraseSignature: node.armoredPassphraseSignature,
            FolderHashKey: node.armoredHashKey,
        });
        return {
            volumeId: response.Volume.ID,
            shareId: response.Volume.Share.ShareID,
            rootNodeId: response.Volume.Share.LinkID,
        }
    }

    async createShare(
        volumeId: string,
        share: {
            addressId: string,
        } & EncryptedShareCrypto,
        node: {
            nodeId: string,
            encryptedName: string,
            nameKeyPacket: string,
            passphraseKeyPacket: string,
        },
    ): Promise<{ shareId: string }> {
        const response = await this.apiService.post<
            // Share name is deprecated.
            Omit<PostCreateShareRequest, 'Name'>,
            PostCreateShareResponse
        >(`/drive/volumes/${volumeId}/shares`, {
            AddressID: share.addressId,
            ShareKey: share.armoredKey,
            SharePassphrase: share.armoredPassphrase,
            SharePassphraseSignature: share.armoredPassphraseSignature,
            RootLinkID: node.nodeId,
            NameKeyPacket: node.nameKeyPacket,
            PassphraseKeyPacket: node.passphraseKeyPacket,
        });

        return {
            shareId: response.Share.ID,
        }
    }
}

function convertSharePayload(response: GetShareResponse): EncryptedShare {
    return {
        volumeId: response.VolumeID,
        shareId: response.ShareID,
        rootNodeId: response.LinkID,
        creatorEmail: response.Creator,
        createdDate: response.CreateTime ? new Date(response.CreateTime*1000) : undefined,
        encryptedCrypto: {
            armoredKey: response.Key,
            armoredPassphrase: response.Passphrase,
            armoredPassphraseSignature: response.PassphraseSignature,
        },
        membership: response.Memberships?.[0] ? {
            memberUid: makeMemberUid(response.ShareID, response.Memberships[0].MemberID),
        } : undefined,
        type: convertShareTypeNumberToEnum(response.Type),
    };
}

function convertShareTypeNumberToEnum(type: 1 | 2 | 3 | 4): ShareType {
    switch (type) {
        case 1:
            return ShareType.Main;
        case 2:
            return ShareType.Standard;
        case 3:
            return ShareType.Device;
        case 4:
            return ShareType.Photo;
    }
}
