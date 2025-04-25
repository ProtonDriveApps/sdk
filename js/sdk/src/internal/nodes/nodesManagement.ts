import { c } from 'ttag';

import { MemberRole, NodeType, NodeResult, resultOk } from "../../interface";
import { AbortError, ValidationError } from "../../errors";
import { getErrorMessage } from '../errors';
import { NodeAPIService } from "./apiService";
import { NodesCache } from "./cache";
import { NodesCryptoCache } from "./cryptoCache";
import { NodesCryptoService } from "./cryptoService";
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
        private cache: NodesCache,
        private cryptoCache: NodesCryptoCache,
        private cryptoService: NodesCryptoService,
        private nodesAccess: NodesAccess,
    ) {
        this.apiService = apiService;
        this.cache = cache;
        this.cryptoCache = cryptoCache;
        this.cryptoService = cryptoService;
        this.nodesAccess = nodesAccess;
    }

    async renameNode(nodeUid: string, newName: string, options = { allowRenameRootNode: false }): Promise<DecryptedNode> {
        validateNodeName(newName);

        const node = await this.nodesAccess.getNode(nodeUid);
        const { nameSessionKey: nodeNameSessionKey } = await this.nodesAccess.getNodePrivateAndSessionKeys(nodeUid);
        const parentKeys = await this.nodesAccess.getParentKeys(node);

        if (!options.allowRenameRootNode && (!node.hash || !parentKeys.hashKey)) {
            throw new ValidationError(c('Error').t`Renaming root item is not allowed`)
        }

        const {
            signatureEmail,
            armoredNodeName,
            hash,
        } = await this.cryptoService.encryptNewName(node, nodeNameSessionKey, parentKeys.hashKey, newName);

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
            nameAuthor: resultOk(signatureEmail),
            hash,
        }
        await this.cache.setNode(newNode);
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
        const [node, newParentNode] = await Promise.all([
            this.nodesAccess.getNode(nodeUid),
            this.nodesAccess.getNode(newParentUid),
        ]);
        const [keys, newParentKeys] = await Promise.all([
            this.nodesAccess.getNodeKeys(nodeUid),
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
            newParentNode,
            { key: newParentKeys.key, hashKey: newParentKeys.hashKey },
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
                // FIXME: content hash
            }
        );
        const newNode: DecryptedNode = {
            ...node,
            parentUid: newParentUid,
            hash: encryptedCrypto.hash,
            keyAuthor: resultOk(encryptedCrypto.signatureEmail),
            nameAuthor: resultOk(encryptedCrypto.nameSignatureEmail),
        };
        await this.cache.setNode(newNode);
        return newNode;
    }

    async* trashNodes(nodeUids: string[], signal?: AbortSignal): AsyncGenerator<NodeResult> {
        const nodesOrMissing = await Array.fromAsync(this.nodesAccess.iterateNodes(nodeUids, signal));
        const nodes = nodesOrMissing.filter(node => !('missingUid' in node)) as DecryptedNode[];

        for await (const result of this.apiService.trashNodes(nodeUids, signal)) {
            if (result.ok) {
                const node = nodes.find(node => node.uid === result.uid);
                if (node) {
                    await this.cache.setNode({
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
                    await this.cache.setNode({
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

        await this.cache.removeNodes(deletedNodeUids);
    }

    async createFolder(parentNodeUid: string, folderName: string, modificationTime?: Date): Promise<DecryptedNode> {
        validateNodeName(folderName);

        const parentNode = await this.nodesAccess.getNode(parentNodeUid);
        const parentKeys = await this.nodesAccess.getNodeKeys(parentNodeUid);
        if (!parentKeys.hashKey) {
            throw new ValidationError(c('Error').t`Creating folders in non-folders is not allowed`);
        }

        const extendedAttributes = generateFolderExtendedAttributes(modificationTime);

        const { encryptedCrypto, keys } = await this.cryptoService.createFolder(
            parentNode,
            { key: parentKeys.key, hashKey: parentKeys.hashKey },
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

        await this.cache.setNode(node);
        await this.cryptoCache.setNodeKeys(nodeUid, keys);
        return node;
    }
}
