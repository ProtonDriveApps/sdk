import { DriveAPIService } from './internal/apiService';
import { ProtonDriveClientContructorParameters, ProtonDriveClientInterface, NodeOrUid, NodeEntity } from './interface';
import { DriveCrypto } from './crypto';
import { initSharesModule } from './internal/shares';
import { initPublicNodesModule } from './internal/nodes';
import { getConfig } from './config';
import { getUid, getUids, convertInternalNodePromise, convertInternalNodeIterator } from './transformers';

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
    const cryptoModule = new DriveCrypto(openPGPCryptoModule);

    const fullConfig = getConfig(config);

    const apiService = new DriveAPIService(httpClient, fullConfig.baseUrl, fullConfig.language, getLogger?.('api'));

    // TODO: public sharing module
    const publicShares = initSharesModule(apiService, entitiesCache, cryptoCache, account, cryptoModule);
    const nodes = initPublicNodesModule(apiService, entitiesCache, cryptoCache, cryptoModule, publicShares);

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
