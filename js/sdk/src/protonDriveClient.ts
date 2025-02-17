import { DriveAPIService } from './internal/apiService';
import { ProtonDriveClientContructorParameters, ProtonDriveClientInterface, NodeOrUid, ShareNodeSettings, UploadMetadata } from './interface';
import { DriveCrypto } from './crypto';
import { initSharesModule } from './internal/shares';
import { initNodesModule } from './internal/nodes';
import { initSharingModule } from './internal/sharing';
import { DriveEventsService } from './internal/events';
import { upload as uploadModule } from './internal/upload';
import { getConfig } from './config';
import { getUid, getUids, convertInternalNodePromise, convertInternalNodeIterator } from './transformers';

export class ProtonDriveClient implements Partial<ProtonDriveClientInterface> {
    private nodes: ReturnType<typeof initNodesModule>;
    private sharing: ReturnType<typeof initSharingModule>;
    private upload: ReturnType<typeof uploadModule>;

    constructor({
        httpClient,
        entitiesCache,
        cryptoCache,
        account,
        getLogger,
        config,
        metrics, // eslint-disable-line @typescript-eslint/no-unused-vars
        openPGPCryptoModule,
        acceptNoGuaranteeWithCustomModules,
    }: ProtonDriveClientContructorParameters) {
        if (openPGPCryptoModule && !acceptNoGuaranteeWithCustomModules) {
            // TODO: define errors and use here
            throw Error('TODO');
        }
        const cryptoModule = new DriveCrypto(openPGPCryptoModule);
    
        const fullConfig = getConfig(config);
    
        const apiService = new DriveAPIService(httpClient, fullConfig.baseUrl, fullConfig.language, getLogger?.('api'));
    
        const events = new DriveEventsService(apiService, entitiesCache, getLogger?.('events'));
        const shares = initSharesModule(apiService, entitiesCache, cryptoCache, account, cryptoModule);
        this.nodes = initNodesModule(apiService, entitiesCache, cryptoCache, account, cryptoModule, events, shares, getLogger?.('nodes'));
        this.sharing = initSharingModule(apiService, entitiesCache, account, cryptoModule, events, shares, this.nodes.access, getLogger?.('sharing'));
        this.upload = uploadModule(apiService, cryptoModule, this.nodes.access);
    }

    // TODO
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async getNodeUid(shareId: string, nodeId: string) {
        return Promise.resolve("")
    }

    async getMyFilesRootFolder() {
        return convertInternalNodePromise(this.nodes.access.getMyFilesRootFolder());
    }

    async* iterateChildren(parentNodeUid: NodeOrUid, signal?: AbortSignal) {
        yield* convertInternalNodeIterator(this.nodes.access.iterateChildren(getUid(parentNodeUid), signal));
    }

    async* iterateTrashedNodes(signal?: AbortSignal) {
        yield* convertInternalNodeIterator(this.nodes.access.iterateTrashedNodes(signal));
    }

    async* iterateNodes(nodeUids: NodeOrUid[], signal?: AbortSignal) {
        yield* convertInternalNodeIterator(this.nodes.access.iterateNodes(getUids(nodeUids), signal));
    }

    async renameNode(nodeUid: NodeOrUid, newName: string) {
        return this.nodes.management.renameNode(getUid(nodeUid), newName);
    }

    async* moveNodes(nodeUids: NodeOrUid[], newParentNodeUid: NodeOrUid, signal?: AbortSignal) {
        yield* this.nodes.management.moveNodes(getUids(nodeUids), getUid(newParentNodeUid), signal);
    }

    async* trashNodes(nodeUids: NodeOrUid[], signal?: AbortSignal) {
        yield* this.nodes.management.trashNodes(getUids(nodeUids), signal);
    }

    async* restoreNodes(nodeUids: NodeOrUid[], signal?: AbortSignal) {
        yield* this.nodes.management.restoreNodes(getUids(nodeUids), signal);
    }

    async* deleteNodes(nodeUids: NodeOrUid[], signal?: AbortSignal) {
        yield* this.nodes.management.deleteNodes(getUids(nodeUids), signal);
    }

    async createFolder(parentNodeUid: NodeOrUid, name: string) {
        return convertInternalNodePromise(this.nodes.management.createFolder(getUid(parentNodeUid), name));
    }

    async* iterateSharedNodes(signal?: AbortSignal) {
        return convertInternalNodeIterator(this.sharing.access.iterateSharedNodes(signal));
    }

    async* iterateSharedNodesWithMe(signal?: AbortSignal) {
        return convertInternalNodeIterator(this.sharing.access.iterateSharedNodesWithMe(signal));
    }

    async shareNode(nodeUid: NodeOrUid, settings: ShareNodeSettings) {
        return this.sharing.shareNode(getUid(nodeUid), settings);
    }

    async getFileUploader(nodeUid: NodeOrUid, name: string, metadata: UploadMetadata, signal?: AbortSignal) {
        return this.upload.getFileUploader(getUid(nodeUid), name, metadata, signal);
    }
}
