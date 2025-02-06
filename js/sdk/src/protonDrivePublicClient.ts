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

export class ProtonDrivePublicClient implements ProtonDrivePublicClientInterface {
    private nodes: ReturnType<typeof initPublicNodesModule>;

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

        // TODO: public sharing module
        const publicShares = initSharesModule(apiService, entitiesCache, cryptoCache, account, cryptoModule);
        this.nodes = initPublicNodesModule(apiService, entitiesCache, cryptoCache, cryptoModule, publicShares);
    }

    async getPublicRootNode(token: string, password: string, customPassword?: string) {
        return convertInternalNodePromise(this.nodes.getPublicRootNode(token, password, customPassword));
    }

    async* iterateChildren(parentNodeUid: NodeOrUid, signal?: AbortSignal) {
        return convertInternalNodeIterator(this.nodes.management.iterateChildren(getUid(parentNodeUid), signal));
    }

    async* iterateNodes(nodeUids: NodeOrUid[], signal?: AbortSignal) {
        return convertInternalNodeIterator(this.nodes.management.iterateNodes(getUids(nodeUids), signal));
    }

}
