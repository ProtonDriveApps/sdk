import { c } from 'ttag';

import { MemberRole, NodeType, NodeResult, resultOk } from "../../interface";
import { AbortError, ValidationError } from "../../errors";
import { getErrorMessage } from '../errors';
import { NodeAPIService } from "./apiService";
import { NodesCryptoCache } from "./cryptoCache";
import { NodesCryptoService } from "./cryptoService";
import { NodesEvents } from './events';
import { DecryptedNode } from "./interface";
import { NodesAccess } from "./nodesAccess";
import { validateNodeName } from "./validations";
import { generateFolderExtendedAttributes } from "./extendedAttributes";

/**
 * Provides high-level actions for managing nodes.
 *
 * The manager is responsible for handling nodes metadata, including
 * API communication, encryption, decryption, and caching.
 *
 * This module uses other modules providing low-level operations, such
 * as API service, cache, crypto service, etc.
 */
export class NodesManagement {
    constructor(
        private apiService: NodeAPIService,
        private cryptoCache: NodesCryptoCache,
        private cryptoService: NodesCryptoService,
        private nodesAccess: NodesAccess,
        private nodesEvents: NodesEvents,
    ) {
        this.apiService = apiService;
        this.cryptoCache = cryptoCache;
        this.cryptoService = cryptoService;
        this.nodesAccess = nodesAccess;
        this.nodesEvents = nodesEvents;
    }

    async renameNode(nodeUid: string, newName: string, options = { allowRenameRootNode: false }): Promise<DecryptedNode> {
        validateNodeName(newName);

        const node = await this.nodesAccess.getNode(nodeUid);
        const { nameSessionKey: nodeNameSessionKey } = await this.nodesAccess.getNodePrivateAndSessionKeys(nodeUid);
        const parentKeys = await this.nodesAccess.getParentKeys(node);
        const address = await this.nodesAccess.getRootNodeEmailKey(nodeUid);

        if (!options.allowRenameRootNode && (!node.hash || !parentKeys.hashKey)) {
            throw new ValidationError(c('Error').t`Renaming root item is not allowed`)
        }

        const {
            signatureEmail,
            armoredNodeName,
            hash,
        } = await this.cryptoService.encryptNewName(parentKeys, nodeNameSessionKey, address, newName);

        // Because hash is optional, lets ensure we have it unless explicitely
        // allowed to rename root node.
        if (!options.allowRenameRootNode && !hash) {
            throw new Error("Node hash not generated");
        }

        await this.apiService.renameNode(
            nodeUid,
            {
                hash: node.hash,
            },
            {
                encryptedName: armoredNodeName,
                nameSignatureEmail: signatureEmail,
                hash: hash,
            }
        );
        const newNode: DecryptedNode = {
            ...node,
            name: resultOk(newName),
            encryptedName: armoredNodeName,
            nameAuthor: resultOk(signatureEmail),
            hash,
        }
        await this.nodesEvents.nodeUpdated(newNode);
        return newNode;
    }

    // Improvement requested: move nodes in parallel
    async* moveNodes(nodeUids: string[], newParentNodeUid: string, signal?: AbortSignal): AsyncGenerator<NodeResult> {
        for (const nodeUid of nodeUids) {
            if (signal?.aborted) {
                throw new AbortError(c('Error').t`Move operation aborted`);
            }
            try {
                await this.moveNode(nodeUid, newParentNodeUid);
                yield {
                    uid: nodeUid,
                    ok: true,
                }
            } catch (error: unknown) {
                yield {
                    uid: nodeUid,
                    ok: false,
                    error: getErrorMessage(error),
                }
            }
        }
    }

    async moveNode(nodeUid: string, newParentUid: string): Promise<DecryptedNode> {
        const [node, address] = await Promise.all([
            this.nodesAccess.getNode(nodeUid),
            this.nodesAccess.getRootNodeEmailKey(newParentUid),
        ]);

        const [keys, newParentKeys] = await Promise.all([
            this.nodesAccess.getNodePrivateAndSessionKeys(nodeUid),
            this.nodesAccess.getNodeKeys(newParentUid),
        ]);

        if (!node.hash) {
            throw new ValidationError(c('Error').t`Moving root item is not allowed`);
        }
        if (!newParentKeys.hashKey) {
            throw new ValidationError(c('Error').t`Moving item to a non-folder is not allowed`);
        }

        const encryptedCrypto = await this.cryptoService.moveNode(
            node,
            keys,
            { key: newParentKeys.key, hashKey: newParentKeys.hashKey },
            address,
        );

        // Node could be uploaded or renamed by anonymous user and thus have
        // missing signatures that must be added to the move request.
        // Node passphrase and signature email must be passed if and only if
        // the the signatures are missing (key author is null).
        const anonymousKey = node.keyAuthor.ok && node.keyAuthor.value === null;
        const keySignatureProperties = !anonymousKey ? {} : {
            signatureEmail: encryptedCrypto.signatureEmail,
            armoredNodePassphraseSignature: encryptedCrypto.armoredNodePassphraseSignature,
        }
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
                // TODO: When moving photos, we need to pass content hash.
            }
        );
        const newNode: DecryptedNode = {
            ...node,
            encryptedName: encryptedCrypto.encryptedName,
            parentUid: newParentUid,
            hash: encryptedCrypto.hash,
            keyAuthor: resultOk(encryptedCrypto.signatureEmail),
            nameAuthor: resultOk(encryptedCrypto.nameSignatureEmail),
        };
        await this.nodesEvents.nodeUpdated(newNode);
        return newNode;
    }

    async* trashNodes(nodeUids: string[], signal?: AbortSignal): AsyncGenerator<NodeResult> {
        const nodesOrMissing = await Array.fromAsync(this.nodesAccess.iterateNodes(nodeUids, signal));
        const nodes = nodesOrMissing.filter(node => !('missingUid' in node)) as DecryptedNode[];

        for await (const result of this.apiService.trashNodes(nodeUids, signal)) {
            if (result.ok) {
                const node = nodes.find(node => node.uid === result.uid);
                if (node) {
                    await this.nodesEvents.nodeUpdated({
                        ...node,
                        trashTime: new Date(),
                    });
                }
            }

            yield result;
        }
    }

    async* restoreNodes(nodeUids: string[], signal?: AbortSignal): AsyncGenerator<NodeResult> {
        const nodesOrMissing = await Array.fromAsync(this.nodesAccess.iterateNodes(nodeUids, signal));
        const nodes = nodesOrMissing.filter(node => !('missingUid' in node)) as DecryptedNode[];

        for await (const result of this.apiService.restoreNodes(nodeUids, signal)) {
            if (result.ok) {
                const node = nodes.find(node => node.uid === result.uid);
                if (node) {
                    await this.nodesEvents.nodeUpdated({
                        ...node,
                        trashTime: undefined,
                    });
                }
            }

            yield result;
        }
    }

    async* deleteNodes(nodeUids: string[], signal?: AbortSignal): AsyncGenerator<NodeResult> {
        const deletedNodeUids = [];

        for await (const result of this.apiService.deleteNodes(nodeUids, signal)) {
            if (result.ok) {
                deletedNodeUids.push(result.uid);
            }
            yield result;
        }

        await this.nodesEvents.nodesDeleted(deletedNodeUids);
    }

    async createFolder(parentNodeUid: string, folderName: string, modificationTime?: Date): Promise<DecryptedNode> {
        validateNodeName(folderName);

        const parentKeys = await this.nodesAccess.getNodeKeys(parentNodeUid);
        if (!parentKeys.hashKey) {
            throw new ValidationError(c('Error').t`Creating folders in non-folders is not allowed`);
        }

        const address = await this.nodesAccess.getRootNodeEmailKey(parentNodeUid);
        const extendedAttributes = generateFolderExtendedAttributes(modificationTime);

        const { encryptedCrypto, keys } = await this.cryptoService.createFolder(
            { key: parentKeys.key, hashKey: parentKeys.hashKey },
            address,
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

        const node: DecryptedNode = {
            // Internal metadata
            hash: encryptedCrypto.hash,
            encryptedName: encryptedCrypto.encryptedName,

            // Basic node metadata
            uid: nodeUid,
            parentUid: parentNodeUid,
            type: NodeType.Folder,
            mediaType: "Folder",
            creationTime: new Date(),

            // Share node metadata
            isShared: false,
            directMemberRole: MemberRole.Inherited,

            // Decrypted metadata
            isStale: false,
            keyAuthor: resultOk(encryptedCrypto.signatureEmail),
            nameAuthor: resultOk(encryptedCrypto.signatureEmail),
            name: resultOk(folderName),
        }

        await this.nodesEvents.nodeCreated(node);
        await this.cryptoCache.setNodeKeys(nodeUid, keys);
        return node;
    }
}
