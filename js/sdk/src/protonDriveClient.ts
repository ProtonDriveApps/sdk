import { ProtonDriveClientContructorParameters, ProtonDriveClientInterface, NodeOrUid, ShareNodeSettings, UnshareNodeSettings, UploadMetadata, Logger } from './interface';
import { DriveCrypto } from './crypto';
import { DriveAPIService } from './internal/apiService';
import { initSharesModule } from './internal/shares';
import { initNodesModule } from './internal/nodes';
import { initSharingModule } from './internal/sharing';
import { initDownloadModule } from './internal/download';
import { initUploadModule } from './internal/upload';
import { DriveEventsService } from './internal/events';
import { getConfig } from './config';
import { getUid, getUids, convertInternalNodePromise, convertInternalNodeIterator } from './transformers';
import { Telemetry } from './telemetry';

export class ProtonDriveClient implements Partial<ProtonDriveClientInterface> {
    private logger: Logger;
    private nodes: ReturnType<typeof initNodesModule>;
    private sharing: ReturnType<typeof initSharingModule>;
    private download: ReturnType<typeof initDownloadModule>;
    private upload: ReturnType<typeof initUploadModule>;

    constructor({
        httpClient,
        entitiesCache,
        cryptoCache,
        account,
        config,
        telemetry,
        openPGPCryptoModule,
        acceptNoGuaranteeWithCustomModules,
    }: ProtonDriveClientContructorParameters) {
        if (!telemetry) {
            telemetry = new Telemetry();
        }
        this.logger = telemetry.getLogger('interface');

        if (openPGPCryptoModule && !acceptNoGuaranteeWithCustomModules) {
            // TODO: define errors and use here
            throw Error('TODO');
        }
        const cryptoModule = new DriveCrypto(openPGPCryptoModule);
    
        const fullConfig = getConfig(config);
    
        const apiService = new DriveAPIService(telemetry, httpClient, fullConfig.baseUrl, fullConfig.language);
    
        const events = new DriveEventsService(telemetry, apiService, entitiesCache);
        const shares = initSharesModule(telemetry, apiService, entitiesCache, cryptoCache, account, cryptoModule);
        this.nodes = initNodesModule(telemetry, apiService, entitiesCache, cryptoCache, account, cryptoModule, events, shares);
        this.sharing = initSharingModule(telemetry, apiService, entitiesCache, account, cryptoModule, events, shares, this.nodes.access);
        this.download = initDownloadModule(apiService, cryptoModule, this.nodes.access);
        this.upload = initUploadModule(apiService, cryptoModule, this.nodes.access);
    }

    // TODO
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async getNodeUid(shareId: string, nodeId: string) {
        this.logger.info(`Getting node UID for share ${shareId} and node ${nodeId}`);
        return Promise.resolve("")
    }

    async getMyFilesRootFolder() {
        this.logger.info('Getting my files root folder');
        return convertInternalNodePromise(this.nodes.access.getMyFilesRootFolder());
    }

    async* iterateChildren(parentNodeUid: NodeOrUid, signal?: AbortSignal) {
        this.logger.info(`Iterating children of ${getUid(parentNodeUid)}`);
        yield* convertInternalNodeIterator(this.nodes.access.iterateChildren(getUid(parentNodeUid), signal));
    }

    async* iterateTrashedNodes(signal?: AbortSignal) {
        this.logger.info('Iterating trashed nodes');
        yield* convertInternalNodeIterator(this.nodes.access.iterateTrashedNodes(signal));
    }

    async* iterateNodes(nodeUids: NodeOrUid[], signal?: AbortSignal) {
        this.logger.info(`Iterating ${nodeUids.length} nodes`);
        yield* convertInternalNodeIterator(this.nodes.access.iterateNodes(getUids(nodeUids), signal));
    }

    async renameNode(nodeUid: NodeOrUid, newName: string) {
        this.logger.info(`Renaming node ${nodeUid} to ${newName}`);
        return this.nodes.management.renameNode(getUid(nodeUid), newName);
    }

    async* moveNodes(nodeUids: NodeOrUid[], newParentNodeUid: NodeOrUid, signal?: AbortSignal) {
        this.logger.info(`Moving ${nodeUids.length} nodes to ${newParentNodeUid}`);
        yield* this.nodes.management.moveNodes(getUids(nodeUids), getUid(newParentNodeUid), signal);
    }

    async* trashNodes(nodeUids: NodeOrUid[], signal?: AbortSignal) {
        this.logger.info(`Trashing ${nodeUids.length} nodes`);
        yield* this.nodes.management.trashNodes(getUids(nodeUids), signal);
    }

    async* restoreNodes(nodeUids: NodeOrUid[], signal?: AbortSignal) {
        this.logger.info(`Restoring ${nodeUids.length} nodes`);
        yield* this.nodes.management.restoreNodes(getUids(nodeUids), signal);
    }

    async* deleteNodes(nodeUids: NodeOrUid[], signal?: AbortSignal) {
        this.logger.info(`Deleting ${nodeUids.length} nodes`);
        yield* this.nodes.management.deleteNodes(getUids(nodeUids), signal);
    }

    async createFolder(parentNodeUid: NodeOrUid, name: string, modificationTime?: Date) {
        this.logger.info(`Creating folder ${name} in ${getUid(parentNodeUid)}`);
        return convertInternalNodePromise(this.nodes.management.createFolder(getUid(parentNodeUid), name, modificationTime));
    }

    async* iterateRevisions(nodeUid: NodeOrUid, signal?: AbortSignal) {
        this.logger.info(`Iterating revisions of ${getUid(nodeUid)}`);
        yield* this.nodes.revisions.iterateRevisions(getUid(nodeUid), signal);
    }

    async restoreRevision(revisionUid: string) {
        this.logger.info(`Restoring revision ${revisionUid}`);
        await this.nodes.revisions.restoreRevision(revisionUid);
    }

    async deleteRevision(revisionUid: string) {
        this.logger.info(`Deleting revision ${revisionUid}`);
        await this.nodes.revisions.deleteRevision(revisionUid);
    }

    async* iterateSharedNodes(signal?: AbortSignal) {
        this.logger.info('Iterating shared nodes by me');
        yield* convertInternalNodeIterator(this.sharing.access.iterateSharedNodes(signal));
    }

    async* iterateSharedNodesWithMe(signal?: AbortSignal) {
        this.logger.info('Iterating shared nodes with me');
        yield* convertInternalNodeIterator(this.sharing.access.iterateSharedNodesWithMe(signal));
    }
    
    async removeSharedNodeWithMe(nodeUid: NodeOrUid) {
        this.logger.info(`Removing shared node with me ${getUid(nodeUid)}`);
        await this.sharing.access.removeSharedNodeWithMe(getUid(nodeUid));
    }

    async* iterateInvitations(signal?: AbortSignal) {
        this.logger.info('Iterating invitations');
        yield* this.sharing.access.iterateInvitations(signal);
    }

    async acceptInvitation(invitationId: string) {
        this.logger.info(`Accepting invitation ${invitationId}`);
        await this.sharing.access.acceptInvitation(invitationId);
    }

    async rejectInvitation(invitationId: string) {
        this.logger.info(`Rejecting invitation ${invitationId}`);
        await this.sharing.access.rejectInvitation(invitationId);
    }

    async getSharingInfo(nodeUid: NodeOrUid) {
        this.logger.info(`Getting sharing info for ${getUid(nodeUid)}`);
        return this.sharing.management.getSharingInfo(getUid(nodeUid));
    }

    async shareNode(nodeUid: NodeOrUid, settings: ShareNodeSettings) {
        this.logger.info(`Sharing node ${getUid(nodeUid)}`);
        return this.sharing.management.shareNode(getUid(nodeUid), settings);
    }

    async unshareNode(nodeUid: NodeOrUid, settings?: UnshareNodeSettings) {
        if (!settings) {
            this.logger.info(`Unsharing node ${getUid(nodeUid)}`);
        } else {
            this.logger.info(`Partially unsharing ${getUid(nodeUid)}`);
        }
        return this.sharing.management.unshareNode(getUid(nodeUid), settings);
    }

    async getFileDownloader(nodeUid: NodeOrUid, signal?: AbortSignal) {
        this.logger.info(`Getting file downloader for ${getUid(nodeUid)}`);
        return this.download.getFileDownloader(getUid(nodeUid), signal);
    }

    async getFileUploader(parentFolderUid: NodeOrUid, name: string, metadata: UploadMetadata, signal?: AbortSignal) {
        this.logger.info(`Getting file uploader for parent ${getUid(parentFolderUid)}`);
        return this.upload.getFileUploader(getUid(parentFolderUid), name, metadata, signal);
    }
}
