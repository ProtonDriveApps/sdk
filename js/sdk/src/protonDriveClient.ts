import { getApiService } from './internal/apiService/index.js'
import { ProtonDriveClientContructorParameters, ProtonDriveClientInterface, NodeOrUid, ShareNodeSettings, UploadMetadata } from './interface/index.js';
import { driveCrypto } from './crypto/index.js'
import { nodes as nodesModule } from './internal/nodes/index.js'
import { shares as sharesModule } from './internal/shares/index.js'
import { sharing as sharingModule } from './internal/sharing/index.js'
import { events as eventsModule } from './internal/events/index.js'
import { upload as uploadModule } from './internal/upload/index.js';
import { getConfig } from './config.js';
import { getUid, getUids, convertInternalNodePromise, convertInternalNodeIterator } from './transformers.js';

export function protonDriveClient({
    httpClient,
    entitiesCache,
    cryptoCache,
    account,
    getLogger,
    config,
    metrics, // eslint-disable-line @typescript-eslint/no-unused-vars
    openPGPCryptoModule,
    acceptNoGuaranteeWithCustomModules,
}: ProtonDriveClientContructorParameters): Partial<ProtonDriveClientInterface> {
    if (openPGPCryptoModule && !acceptNoGuaranteeWithCustomModules) {
        // TODO: define errors and use here
        throw Error('TODO');
    }
    const cryptoModule = driveCrypto(openPGPCryptoModule);

    const fullConfig = getConfig(config);

    const apiService = getApiService(httpClient, fullConfig.baseUrl, fullConfig.language, getLogger?.('api'));

    const events = eventsModule(apiService);
    const shares = sharesModule(apiService, entitiesCache, cryptoCache, account, cryptoModule);
    const nodes = nodesModule(apiService, entitiesCache, cryptoCache, account, cryptoModule, events, shares, getLogger?.('nodes'));
    const sharing = sharingModule(apiService, account, cryptoModule, nodes);
    const upload = uploadModule(apiService, cryptoModule, nodes);

    return {
        // TODO
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        getNodeUid: (shareId: string, nodeId: string) => Promise.resolve(""),
        getMyFilesRootFolder: () => {
            return convertInternalNodePromise(nodes.getMyFilesRootFolder());
        },
        iterateChildren: (parentNodeUid: NodeOrUid, signal?: AbortSignal) => {
            return convertInternalNodeIterator(nodes.iterateChildren(getUid(parentNodeUid), signal));
        },
        iterateNodes: (nodeUids: NodeOrUid[], signal?: AbortSignal) => {
            return convertInternalNodeIterator(nodes.iterateNodes(getUids(nodeUids), signal));
        },
        shareNode: (nodeUid: NodeOrUid, settings: ShareNodeSettings) => {
            return sharing.shareNode(getUid(nodeUid), settings);
        },
        getFileUploader: (nodeUid: NodeOrUid, name: string, metadata: UploadMetadata, signal?: AbortSignal) => {
            return upload.getFileUploader(getUid(nodeUid), name, metadata, signal);
        }
    }
}
