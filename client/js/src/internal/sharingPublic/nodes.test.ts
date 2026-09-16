import { MemberRole } from '../../interface';
import { getMockLogger } from '../../tests/logger';
import { DriveAPIService } from '../apiService';
import { SharingPublicNodesAPIService } from './nodes';

describe('SharingPublicNodesAPIService', () => {
    let apiMock: DriveAPIService;
    let api: SharingPublicNodesAPIService;

    beforeEach(() => {
        jest.clearAllMocks();

        // @ts-expect-error Mocking for testing purposes
        apiMock = {
            post: jest.fn(),
        };

        api = new SharingPublicNodesAPIService(
            getMockLogger(),
            apiMock,
            'clientUid',
            'volumeId~rootId',
            MemberRole.Viewer,
        );
    });

    describe('createDocument', () => {
        it('should create document via the v2 volumes endpoint', async () => {
            apiMock.post = jest.fn().mockResolvedValue({
                Document: {
                    VolumeID: 'volumeId',
                    LinkID: 'linkId',
                    RevisionID: 'revisionId',
                },
                Code: 1000,
            });

            const nodeUid = await api.createDocument('volumeId~parentId', {
                armoredKey: 'nodeKey',
                armoredNodePassphrase: 'nodePassphrase',
                armoredNodePassphraseSignature: 'nodePassphraseSignature',
                signatureEmail: 'signature@example.com',
                encryptedName: 'encryptedName',
                hash: 'hash',
                base64ContentKeyPacket: 'contentKeyPacket',
                armoredContentKeyPacketSignature: 'contentKeyPacketSignature',
                armoredManifestSignature: 'manifestSignature',
                documentType: 1,
            });

            expect(apiMock.post).toHaveBeenCalledWith('drive/v2/volumes/volumeId/documents', {
                ParentLinkID: 'parentId',
                NodeKey: 'nodeKey',
                NodePassphrase: 'nodePassphrase',
                NodePassphraseSignature: 'nodePassphraseSignature',
                SignatureAddress: 'signature@example.com',
                Name: 'encryptedName',
                Hash: 'hash',
                ContentKeyPacket: 'contentKeyPacket',
                ContentKeyPacketSignature: 'contentKeyPacketSignature',
                ManifestSignature: 'manifestSignature',
                DocumentType: 1,
            });
            expect(nodeUid).toBe('volumeId~linkId');
        });
    });
});
