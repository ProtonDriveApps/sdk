import { getApiService } from './internal/apiService/index.js';
import { ProtonDriveClientContructorParameters, ProtonDriveClientInterface, NodeOrUid, NodeEntity } from './interface/index.js';
import { driveCrypto } from './crypto/index.js';
import { publicNodes as publicNodesModule } from './internal/nodes/index.js';
import { shares as sharesModule } from './internal/shares/index.js';
import { getConfig } from './config.js';
import { getUid, getUids, convertInternalNodePromise, convertInternalNodeIterator } from './transformers.js';

interface ProtonDrivePublicClientInterface extends Partial<ProtonDriveClientInterface> {
    getPublicRootNode(token: string, password: string, customPassword?: string): Promise<NodeEntity>,
}

export function protonDrivePublicClient({
    httpClient,
    entitiesCache,
    cryptoCache,
    account,
    getLogger,
    config,
    metrics, // eslint-disable-line @typescript-eslint/no-unused-vars
    openPGPCryptoModule,
    acceptNoGuaranteeWithCustomModules,
}: ProtonDriveClientContructorParameters): ProtonDrivePublicClientInterface {
    if (openPGPCryptoModule && !acceptNoGuaranteeWithCustomModules) {
        // TODO: define errors and use here
        throw Error('TODO');
    }
    const cryptoModule = driveCrypto(openPGPCryptoModule);

    const fullConfig = getConfig(config);

    const apiService = getApiService(httpClient, fullConfig.baseUrl, fullConfig.language, getLogger?.('api'));

    // TODO: public sharing module
    const publicShares = sharesModule(apiService, entitiesCache, cryptoCache, account, cryptoModule);
    const nodes = publicNodesModule(apiService, entitiesCache, cryptoCache, cryptoModule, publicShares);

    return {
        getPublicRootNode: (token: string, password: string, customPassword?: string) => {
            return convertInternalNodePromise(nodes.getPublicRootNode(token, password, customPassword));
        },
        iterateChildren: (parentNodeUid: NodeOrUid, signal?: AbortSignal) => {
            return convertInternalNodeIterator(nodes.iterateChildren(getUid(parentNodeUid), signal));
        },
        iterateNodes: (nodeUids: NodeOrUid[], signal?: AbortSignal) => {
            return convertInternalNodeIterator(nodes.iterateNodes(getUids(nodeUids), signal));
        },
    }
}
