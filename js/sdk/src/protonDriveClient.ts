import { DriveAPIService } from './internal/apiService';
import { ProtonDriveClientContructorParameters, ProtonDriveClientInterface, NodeOrUid, ShareNodeSettings, UploadMetadata } from './interface';
import { DriveCrypto } from './crypto';
import { initSharesModule } from './internal/shares';
import { initNodesModule } from './internal/nodes';
import { sharing as sharingModule } from './internal/sharing';
import { events as eventsModule } from './internal/events';
import { upload as uploadModule } from './internal/upload';
import { getConfig } from './config';
import { getUid, getUids, convertInternalNodePromise, convertInternalNodeIterator } from './transformers';

export class ProtonDriveClient implements Partial<ProtonDriveClientInterface> {
    private nodes: ReturnType<typeof initNodesModule>;
    private sharing: ReturnType<typeof sharingModule>;
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
    
        const events = eventsModule(apiService);
        const shares = initSharesModule(apiService, entitiesCache, cryptoCache, account, cryptoModule);
        this.nodes = initNodesModule(apiService, entitiesCache, cryptoCache, account, cryptoModule, events, shares, getLogger?.('nodes'));
        this.sharing = sharingModule(apiService, account, cryptoModule, this.nodes.access);
        this.upload = uploadModule(apiService, cryptoModule, this.nodes.access);
    }

    // TODO
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async getNodeUid(shareId: string, nodeId: string) {
        return Promise.resolve("")
    }

    async getMyFilesRootFolder() {
        return convertInternalNodePromise(this.nodes.management.getMyFilesRootFolder());
    }

    async* iterateChildren(parentNodeUid: NodeOrUid, signal?: AbortSignal) {
        return convertInternalNodeIterator(this.nodes.management.iterateChildren(getUid(parentNodeUid), signal));
    }

    async* iterateNodes(nodeUids: NodeOrUid[], signal?: AbortSignal) {
        return convertInternalNodeIterator(this.nodes.management.iterateNodes(getUids(nodeUids), signal));
    }

    async shareNode(nodeUid: NodeOrUid, settings: ShareNodeSettings) {
        return this.sharing.shareNode(getUid(nodeUid), settings);
    }

    async getFileUploader(nodeUid: NodeOrUid, name: string, metadata: UploadMetadata, signal?: AbortSignal) {
        return this.upload.getFileUploader(getUid(nodeUid), name, metadata, signal);
    }
}
