import { MemberRole, NodeType, resultOk } from '../../interface';
import { BatchLoading } from '../batchLoading';
import { DecryptedNode } from '../nodes';
import { ALBUM_MEDIA_TYPE } from '../nodes/mediaTypes';
import { validateNodeName } from '../nodes/validations';
import { splitNodeUid } from '../uids';
import { AlbumsCryptoService } from './albumsCrypto';
import { PhotosAPIService } from './apiService';
import { DecryptedPhotoNode } from './interface';
import { PhotosNodesAccess } from './nodes';
import { PhotoSharesManager } from './shares';

const BATCH_LOADING_SIZE = 10;

/**
 * Provides access and high-level actions for managing albums.
 */
export class Albums {
    constructor(
        private apiService: PhotosAPIService,
        private cryptoService: AlbumsCryptoService,
        private photoShares: PhotoSharesManager,
        private nodesService: PhotosNodesAccess,
    ) {
        this.apiService = apiService;
        this.cryptoService = cryptoService;
        this.photoShares = photoShares;
        this.nodesService = nodesService;
    }

    async *iterateAlbums(signal?: AbortSignal): AsyncGenerator<DecryptedNode> {
        const { volumeId } = await this.photoShares.getRootIDs();

        const batchLoading = new BatchLoading<string, DecryptedNode>({
            iterateItems: (nodeUids) => this.iterateNodesAndIgnoreMissingOnes(nodeUids, signal),
            batchSize: BATCH_LOADING_SIZE,
        });
        for await (const album of this.apiService.iterateAlbums(volumeId, signal)) {
            yield* batchLoading.load(album.albumUid);
        }
        yield* batchLoading.loadRest();
    }

    async createAlbum(name: string): Promise<DecryptedPhotoNode> {
        validateNodeName(name);

        const rootNode = await this.nodesService.getVolumeRootFolder();
        const parentKeys = await this.nodesService.getNodeKeys(rootNode.uid);
        if (!parentKeys.hashKey) {
            throw new Error('Cannot create album: parent folder hash key not available');
        }

        const signingKeys = await this.nodesService.getNodeSigningKeys({ parentNodeUid: rootNode.uid });
        const { encryptedCrypto } = await this.cryptoService.createAlbum(
            { key: parentKeys.key, hashKey: parentKeys.hashKey },
            signingKeys,
            name,
        );

        const nodeUid = await this.apiService.createAlbum(rootNode.uid, {
            encryptedName: encryptedCrypto.encryptedName,
            hash: encryptedCrypto.hash,
            armoredKey: encryptedCrypto.armoredKey,
            armoredNodePassphrase: encryptedCrypto.armoredNodePassphrase,
            armoredNodePassphraseSignature: encryptedCrypto.armoredNodePassphraseSignature,
            signatureEmail: encryptedCrypto.signatureEmail,
            armoredHashKey: encryptedCrypto.armoredHashKey,
        });

        await this.nodesService.notifyChildCreated(rootNode.uid);

        return {
            // Internal metadata
            hash: encryptedCrypto.hash,
            encryptedName: encryptedCrypto.encryptedName,

            // Basic node metadata
            uid: nodeUid,
            parentUid: rootNode.uid,
            type: NodeType.Album,
            mediaType: ALBUM_MEDIA_TYPE,
            creationTime: new Date(),
            modificationTime: new Date(),

            // Share node metadata
            isShared: false,
            isSharedPublicly: false,
            directRole: MemberRole.Inherited,

            // Decrypted metadata
            isStale: false,
            keyAuthor: resultOk(encryptedCrypto.signatureEmail),
            nameAuthor: resultOk(encryptedCrypto.signatureEmail),
            name: resultOk(name),
            treeEventScopeId: splitNodeUid(nodeUid).volumeId,
        };
    }

    async updateAlbum(
        nodeUid: string,
        updates: {
            name?: string;
            coverPhotoNodeUid?: string;
        },
    ): Promise<DecryptedPhotoNode> {
        if (updates.name) {
            validateNodeName(updates.name);
        }

        const node = await this.nodesService.getNode(nodeUid);
        const newNode = { ...node };

        let nameUpdate:
            | {
                  encryptedName: string;
                  hash: string;
                  originalHash: string;
                  nameSignatureEmail: string;
              }
            | undefined;

        if (updates.name) {
            const parentKeys = await this.nodesService.getParentKeys(node);
            const signingKeys = await this.nodesService.getNodeSigningKeys({ nodeUid, parentNodeUid: node.parentUid });

            const { signatureEmail, armoredNodeName, hash } = await this.cryptoService.renameAlbum(
                { key: parentKeys.key, hashKey: parentKeys.hashKey },
                node.encryptedName,
                signingKeys,
                updates.name,
            );

            nameUpdate = {
                encryptedName: armoredNodeName,
                hash,
                originalHash: node.hash || '',
                nameSignatureEmail: signatureEmail,
            };
            newNode.name = resultOk(updates.name);
            newNode.encryptedName = nameUpdate.encryptedName;
            newNode.nameAuthor = resultOk(nameUpdate.nameSignatureEmail);
            newNode.hash = nameUpdate.hash;
        }

        await this.apiService.updateAlbum(nodeUid, updates.coverPhotoNodeUid, nameUpdate);
        await this.nodesService.notifyNodeChanged(nodeUid);
        return newNode;
    }

    async deleteAlbum(nodeUid: string, options: { force?: boolean } = {}): Promise<void> {
        await this.apiService.deleteAlbum(nodeUid, options);
        await this.nodesService.notifyNodeDeleted(nodeUid);
    }

    private async *iterateNodesAndIgnoreMissingOnes(
        nodeUids: string[],
        signal?: AbortSignal,
    ): AsyncGenerator<DecryptedNode> {
        const nodeGenerator = this.nodesService.iterateNodes(nodeUids, signal);
        for await (const node of nodeGenerator) {
            if ('missingUid' in node) {
                continue;
            }
            yield node;
        }
    }
}
