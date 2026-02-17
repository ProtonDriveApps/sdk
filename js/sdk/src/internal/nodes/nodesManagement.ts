import { c } from 'ttag';

import { MemberRole, NodeType, NodeResult, NodeResultWithNewUid, resultOk, InvalidNameError } from '../../interface';
import { AbortError, ValidationError } from '../../errors';
import { createErrorFromUnknown, getErrorMessage } from '../errors';
import { splitNodeUid } from '../uids';
import { NodeAPIServiceBase } from './apiService';
import { NodesCryptoCache } from './cryptoCache';
import { NodesCryptoService } from './cryptoService';
import { NodeOutOfSyncError } from './errors';
import { generateFolderExtendedAttributes } from './extendedAttributes';
import { DecryptedNode, EncryptedNode } from './interface';
import { splitExtension, joinNameAndExtension } from './nodeName';
import { NodesAccessBase } from './nodesAccess';
import { FOLDER_MEDIA_TYPE } from './mediaTypes';
import { validateNodeName } from './validations';

const AVAILABLE_NAME_BATCH_SIZE = 10;
const AVAILABLE_NAME_LIMIT = 1000;

/**
 * Provides high-level actions for managing nodes.
 *
 * The manager is responsible for handling nodes metadata, including
 * API communication, encryption, decryption, and caching.
 *
 * This module uses other modules providing low-level operations, such
 * as API service, cache, crypto service, etc.
 */
export abstract class NodesManagementBase<
    TEncryptedNode extends EncryptedNode = EncryptedNode,
    TDecryptedNode extends DecryptedNode = DecryptedNode,
    TNodesCryptoService extends NodesCryptoService = NodesCryptoService,
> {
    constructor(
        protected apiService: NodeAPIServiceBase<TEncryptedNode>,
        protected cryptoCache: NodesCryptoCache,
        protected cryptoService: NodesCryptoService,
        protected nodesAccess: NodesAccessBase<TEncryptedNode, TDecryptedNode, TNodesCryptoService>,
    ) {
        this.apiService = apiService;
        this.cryptoCache = cryptoCache;
        this.cryptoService = cryptoService;
        this.nodesAccess = nodesAccess;
    }

    async renameNode(
        nodeUid: string,
        newName: string,
        options = { allowRenameRootNode: false },
    ): Promise<TDecryptedNode> {
        validateNodeName(newName);

        const node = await this.nodesAccess.getNode(nodeUid);
        const { nameSessionKey: nodeNameSessionKey } = await this.nodesAccess.getNodePrivateAndSessionKeys(nodeUid);
        const parentKeys = await this.nodesAccess.getParentKeys(node);
        const signingKeys = await this.nodesAccess.getNodeSigningKeys({ nodeUid, parentNodeUid: node.parentUid });

        if (!options.allowRenameRootNode && (!node.hash || !parentKeys.hashKey)) {
            throw new ValidationError(c('Error').t`Renaming root item is not allowed`);
        }

        const { signatureEmail, armoredNodeName, hash } = await this.cryptoService.encryptNewName(
            parentKeys,
            nodeNameSessionKey,
            signingKeys,
            newName,
        );

        // Because hash is optional, lets ensure we have it unless explicitely
        // allowed to rename root node.
        if (!options.allowRenameRootNode && !hash) {
            throw new Error('Node hash not generated');
        }

        try {
            await this.apiService.renameNode(
                nodeUid,
                {
                    hash: node.hash,
                },
                {
                    encryptedName: armoredNodeName,
                    nameSignatureEmail: signatureEmail,
                    hash: hash,
                },
            );
        } catch (error: unknown) {
            // If node is out of sync, we notify cache to refresh it before next usage.
            // We let the code still throw the error as it must bubble to the user
            // so user can re-open the node to ensure they still want to rename it.
            if (error instanceof NodeOutOfSyncError) {
                await this.nodesAccess.notifyNodeChanged(nodeUid);
            }
            throw error;
        }

        await this.nodesAccess.notifyNodeChanged(nodeUid);
        const newNode: TDecryptedNode = {
            ...node,
            name: resultOk(newName),
            encryptedName: armoredNodeName,
            nameAuthor: resultOk(signatureEmail || null),
            hash,
        };
        return newNode;
    }

    // Improvement requested: move nodes in parallel
    async *moveNodes(nodeUids: string[], newParentNodeUid: string, signal?: AbortSignal): AsyncGenerator<NodeResult> {
        for (const nodeUid of nodeUids) {
            if (signal?.aborted) {
                throw new AbortError(c('Error').t`Move operation aborted`);
            }
            try {
                await this.moveNode(nodeUid, newParentNodeUid);
                yield {
                    uid: nodeUid,
                    ok: true,
                };
            } catch (error: unknown) {
                yield {
                    uid: nodeUid,
                    ok: false,
                    error: getErrorMessage(error),
                };
            }
        }
    }

    async emptyTrash(): Promise<void> {
        const node = await this.nodesAccess.getVolumeRootFolder();
        const { volumeId } = splitNodeUid(node.uid);
        await this.apiService.emptyTrash(volumeId);
    }

    async moveNode(nodeUid: string, newParentUid: string): Promise<TDecryptedNode> {
        const node = await this.nodesAccess.getNode(nodeUid);

        const [keys, newParentKeys, signingKeys] = await Promise.all([
            this.nodesAccess.getNodePrivateAndSessionKeys(nodeUid),
            this.nodesAccess.getNodeKeys(newParentUid),
            this.nodesAccess.getNodeSigningKeys({ nodeUid, parentNodeUid: newParentUid }),
        ]);

        if (!node.hash) {
            throw new ValidationError(c('Error').t`Moving root item is not allowed`);
        }
        if (!newParentKeys.hashKey) {
            throw new ValidationError(c('Error').t`Moving item to a non-folder is not allowed`);
        }

        const encryptedCrypto = await this.cryptoService.encryptNodeWithNewParent(
            node.name,
            keys,
            { key: newParentKeys.key, hashKey: newParentKeys.hashKey },
            signingKeys,
        );

        // Node could be uploaded or renamed by anonymous user and thus have
        // missing signatures that must be added to the move request.
        // Node passphrase and signature email must be passed if and only if
        // the the signatures are missing (key author is null).
        const anonymousKey = node.keyAuthor.ok && node.keyAuthor.value === null;
        const keySignatureProperties = !anonymousKey
            ? {}
            : {
                  signatureEmail: encryptedCrypto.signatureEmail,
                  armoredNodePassphraseSignature: encryptedCrypto.armoredNodePassphraseSignature,
              };
        await this.apiService.moveNode(
            nodeUid,
            {
                hash: node.hash,
            },
            {
                ...keySignatureProperties,
                parentUid: newParentUid,
                armoredNodePassphrase: encryptedCrypto.armoredNodePassphrase,
                encryptedName: encryptedCrypto.encryptedName,
                nameSignatureEmail: encryptedCrypto.nameSignatureEmail,
                hash: encryptedCrypto.hash,
            },
        );
        const newNode: TDecryptedNode = {
            ...node,
            encryptedName: encryptedCrypto.encryptedName,
            parentUid: newParentUid,
            hash: encryptedCrypto.hash,
            keyAuthor: resultOk(encryptedCrypto.signatureEmail),
            nameAuthor: resultOk(encryptedCrypto.nameSignatureEmail),
        };
        await this.nodesAccess.notifyNodeChanged(node.uid, newParentUid);
        return newNode;
    }

    // Improvement requested: copy nodes in parallel using copy_multiple endpoint
    async *copyNodes(
        nodeUidsOrWithNames: (string | { uid: string; name: string })[],
        newParentNodeUid: string,
        signal?: AbortSignal,
    ): AsyncGenerator<NodeResultWithNewUid> {
        for (const nodeUidOrWithName of nodeUidsOrWithNames) {
            if (signal?.aborted) {
                throw new AbortError(c('Error').t`Copy operation aborted`);
            }
            const nodeUid = typeof nodeUidOrWithName === 'string' ? nodeUidOrWithName : nodeUidOrWithName.uid;
            const name = typeof nodeUidOrWithName === 'string' ? undefined : nodeUidOrWithName.name;
            try {
                const { uid: newNodeUid } = await this.copyNode(nodeUid, newParentNodeUid, name);
                yield {
                    uid: nodeUid,
                    newUid: newNodeUid,
                    ok: true,
                };
            } catch (error: unknown) {
                yield {
                    uid: nodeUid,
                    ok: false,
                    error: createErrorFromUnknown(error),
                };
            }
        }
    }

    async copyNode(nodeUid: string, newParentUid: string, name?: string): Promise<TDecryptedNode> {
        if (name) {
            validateNodeName(name);
        }

        const node = await this.nodesAccess.getNode(nodeUid);
        const nodeName = name ? resultOk<string, Error | InvalidNameError>(name) : node.name;

        const [keys, newParentKeys, signingKeys] = await Promise.all([
            this.nodesAccess.getNodePrivateAndSessionKeys(nodeUid),
            this.nodesAccess.getNodeKeys(newParentUid),
            this.nodesAccess.getNodeSigningKeys({ nodeUid, parentNodeUid: newParentUid }),
        ]);

        if (!newParentKeys.hashKey) {
            throw new ValidationError(c('Error').t`Copying item to a non-folder is not allowed`);
        }

        const encryptedCrypto = await this.cryptoService.encryptNodeWithNewParent(
            nodeName,
            keys,
            { key: newParentKeys.key, hashKey: newParentKeys.hashKey },
            signingKeys,
        );

        // Node could be uploaded or renamed by anonymous user and thus have
        // missing signatures that must be added to the copy request.
        // Node passphrase and signature email must be passed if and only if
        // the the signatures are missing (key author is null).
        const anonymousKey = node.keyAuthor.ok && node.keyAuthor.value === null;
        const keySignatureProperties = !anonymousKey
            ? {}
            : {
                  signatureEmail: encryptedCrypto.signatureEmail,
                  armoredNodePassphraseSignature: encryptedCrypto.armoredNodePassphraseSignature,
              };
        const newNodeUid = await this.apiService.copyNode(nodeUid, {
            ...keySignatureProperties,
            parentUid: newParentUid,
            armoredNodePassphrase: encryptedCrypto.armoredNodePassphrase,
            encryptedName: encryptedCrypto.encryptedName,
            nameSignatureEmail: encryptedCrypto.nameSignatureEmail,
            hash: encryptedCrypto.hash,
        });
        const newNode: TDecryptedNode = {
            ...node,
            name: nodeName,
            uid: newNodeUid,
            encryptedName: encryptedCrypto.encryptedName,
            parentUid: newParentUid,
            hash: encryptedCrypto.hash,
            keyAuthor: resultOk(encryptedCrypto.signatureEmail),
            nameAuthor: resultOk(encryptedCrypto.nameSignatureEmail),
        };
        await this.nodesAccess.notifyChildCreated(newParentUid);
        return newNode;
    }

    async *trashNodes(nodeUids: string[], signal?: AbortSignal): AsyncGenerator<NodeResult> {
        for await (const result of this.apiService.trashNodes(nodeUids, signal)) {
            if (result.ok) {
                await this.nodesAccess.notifyNodeChanged(result.uid);
            }
            yield result;
        }
    }

    async *restoreNodes(nodeUids: string[], signal?: AbortSignal): AsyncGenerator<NodeResult> {
        for await (const result of this.apiService.restoreNodes(nodeUids, signal)) {
            if (result.ok) {
                await this.nodesAccess.notifyNodeChanged(result.uid);
            }
            yield result;
        }
    }

    async *deleteTrashedNodes(nodeUids: string[], signal?: AbortSignal): AsyncGenerator<NodeResult> {
        for await (const result of this.apiService.deleteTrashedNodes(nodeUids, signal)) {
            if (result.ok) {
                await this.nodesAccess.notifyNodeDeleted(result.uid);
            }
            yield result;
        }
    }

    // FIXME create test for create folder
    async createFolder(parentNodeUid: string, folderName: string, modificationTime?: Date): Promise<TDecryptedNode> {
        validateNodeName(folderName);

        const parentKeys = await this.nodesAccess.getNodeKeys(parentNodeUid);
        if (!parentKeys.hashKey) {
            throw new ValidationError(c('Error').t`Creating folders in non-folders is not allowed`);
        }

        const signingKeys = await this.nodesAccess.getNodeSigningKeys({ parentNodeUid });
        const extendedAttributes = generateFolderExtendedAttributes(modificationTime);

        const { encryptedCrypto, keys } = await this.cryptoService.createFolder(
            { key: parentKeys.key, hashKey: parentKeys.hashKey },
            signingKeys,
            folderName,
            extendedAttributes,
        );
        const nodeUid = await this.apiService.createFolder(parentNodeUid, {
            armoredKey: encryptedCrypto.armoredKey,
            armoredHashKey: encryptedCrypto.folder.armoredHashKey,
            armoredNodePassphrase: encryptedCrypto.armoredNodePassphrase,
            armoredNodePassphraseSignature: encryptedCrypto.armoredNodePassphraseSignature,
            signatureEmail: encryptedCrypto.signatureEmail,
            encryptedName: encryptedCrypto.encryptedName,
            hash: encryptedCrypto.hash,
            armoredExtendedAttributes: encryptedCrypto.folder.armoredExtendedAttributes,
        });

        await this.nodesAccess.notifyChildCreated(parentNodeUid);
        const node = this.generateNodeFolder(nodeUid, parentNodeUid, folderName, encryptedCrypto);
        await this.cryptoCache.setNodeKeys(nodeUid, keys);
        return node;
    }

    protected abstract generateNodeFolder(
        nodeUid: string,
        parentUid: string,
        name: string,
        encryptedCrypto: {
            hash: string;
            encryptedName: string;
            signatureEmail: string | null;
        },
    ): TDecryptedNode;

    protected generateNodeFolderBase(
        nodeUid: string,
        parentNodeUid: string,
        name: string,
        encryptedCrypto: {
            hash: string;
            encryptedName: string;
            signatureEmail: string | null;
        },
    ): DecryptedNode {
        return {
            // Internal metadata
            hash: encryptedCrypto.hash,
            encryptedName: encryptedCrypto.encryptedName,

            // Basic node metadata
            uid: nodeUid,
            parentUid: parentNodeUid,
            type: NodeType.Folder,
            mediaType: FOLDER_MEDIA_TYPE,
            creationTime: new Date(),
            modificationTime: new Date(),

            // Share node metadata
            isShared: false,
            isSharedPublicly: false,
            directRole: MemberRole.Inherited,

            // Decrypted metadata
            isStale: false,
            keyAuthor: resultOk(encryptedCrypto.signatureEmail || null),
            nameAuthor: resultOk(encryptedCrypto.signatureEmail || null),
            name: resultOk(name),
            treeEventScopeId: splitNodeUid(nodeUid).volumeId,
        };
    }

    async findAvailableName(parentFolderUid: string, name: string): Promise<string> {
        const { hashKey: parentHashKey } = await this.nodesAccess.getNodeKeys(parentFolderUid);
        if (!parentHashKey) {
            throw new ValidationError(c('Error').t`Creating files in non-folders is not allowed`);
        }

        const [namePart, extension] = splitExtension(name);

        let startIndex = 1;
        while (startIndex < AVAILABLE_NAME_LIMIT) {
            const namesToCheck = startIndex === 1 ? [name] : [];
            for (let i = startIndex; i < startIndex + AVAILABLE_NAME_BATCH_SIZE; i++) {
                namesToCheck.push(joinNameAndExtension(namePart, i, extension));
            }

            const hashesToCheck = await this.cryptoService.generateNameHashes(parentHashKey, namesToCheck);

            const { availableHashes } = await this.apiService.checkAvailableHashes(
                parentFolderUid,
                hashesToCheck.map(({ hash }) => hash),
            );

            if (!availableHashes.length) {
                startIndex += AVAILABLE_NAME_BATCH_SIZE;
                continue;
            }

            const availableHash = hashesToCheck.find(({ hash }) => hash === availableHashes[0]);
            if (!availableHash) {
                throw Error('Backend returned unexpected hash');
            }

            return availableHash.name;
        }

        throw new ValidationError(c('Error').t`No available name found`);
    }
}

export class NodesManagement extends NodesManagementBase {
    protected generateNodeFolder(
        nodeUid: string,
        parentNodeUid: string,
        name: string,
        encryptedCrypto: {
            hash: string;
            encryptedName: string;
            signatureEmail: string | null;
        },
    ): DecryptedNode {
        return this.generateNodeFolderBase(nodeUid, parentNodeUid, name, encryptedCrypto);
    }
}
