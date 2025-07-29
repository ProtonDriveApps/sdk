import { c } from 'ttag';

import { DriveCrypto } from '../../crypto';
import { ValidationError } from '../../errors';
import { ProtonDriveAccount, ProtonDriveTelemetry, NodeType, ThumbnailType, ThumbnailResult } from '../../interface';
import { DriveAPIService } from '../apiService';
import { DownloadAPIService } from './apiService';
import { DownloadCryptoService } from './cryptoService';
import { NodesService, RevisionsService, SharesService } from './interface';
import { FileDownloader } from './fileDownloader';
import { DownloadQueue } from './queue';
import { DownloadTelemetry } from './telemetry';
import { makeNodeUidFromRevisionUid } from '../uids';
import { ThumbnailDownloader } from './thumbnailDownloader';

export function initDownloadModule(
    telemetry: ProtonDriveTelemetry,
    apiService: DriveAPIService,
    driveCrypto: DriveCrypto,
    account: ProtonDriveAccount,
    sharesService: SharesService,
    nodesService: NodesService,
    revisionsService: RevisionsService,
) {
    const queue = new DownloadQueue();
    const api = new DownloadAPIService(apiService);
    const cryptoService = new DownloadCryptoService(driveCrypto, account);
    const downloadTelemetry = new DownloadTelemetry(telemetry, sharesService);

    async function getFileDownloader(nodeUid: string, signal?: AbortSignal): Promise<FileDownloader> {
        await queue.waitForCapacity(signal);

        let node, nodeKey;
        try {
            node = await nodesService.getNode(nodeUid);
            nodeKey = await nodesService.getNodeKeys(nodeUid);

            if (node.type === NodeType.Folder) {
                throw new ValidationError(c('Error').t`Cannot download a folder`);
            }
            if (!nodeKey.contentKeyPacketSessionKey) {
                throw new ValidationError(c('Error').t`File has no content key`);
            }
            if (!node.activeRevision?.ok || !node.activeRevision.value) {
                throw new ValidationError(c('Error').t`File has no active revision`);
            }
        } catch (error: unknown) {
            queue.releaseCapacity();
            void downloadTelemetry.downloadInitFailed(nodeUid, error);
            throw error;
        }

        const onFinish = () => queue.releaseCapacity();

        return new FileDownloader(
            downloadTelemetry,
            api,
            cryptoService,
            {
                key: nodeKey.key,
                contentKeyPacketSessionKey: nodeKey.contentKeyPacketSessionKey,
            },
            node.activeRevision.value,
            signal,
            onFinish,
        );
    }

    async function getFileRevisionDownloader(nodeRevisionUid: string, signal?: AbortSignal): Promise<FileDownloader> {
        await queue.waitForCapacity(signal);

        const nodeUid = makeNodeUidFromRevisionUid(nodeRevisionUid);

        let node, nodeKey, revision;
        try {
            node = await nodesService.getNode(nodeUid);
            nodeKey = await nodesService.getNodeKeys(nodeUid);
            revision = await revisionsService.getRevision(nodeRevisionUid);

            if (node.type === NodeType.Folder) {
                throw new ValidationError(c('Error').t`Cannot download a folder`);
            }
            if (!nodeKey.contentKeyPacketSessionKey) {
                throw new ValidationError(c('Error').t`File has no content key`);
            }
        } catch (error: unknown) {
            queue.releaseCapacity();
            void downloadTelemetry.downloadInitFailed(nodeUid, error);
            throw error;
        }

        const onFinish = () => queue.releaseCapacity();

        return new FileDownloader(
            downloadTelemetry,
            api,
            cryptoService,
            {
                key: nodeKey.key,
                contentKeyPacketSessionKey: nodeKey.contentKeyPacketSessionKey,
            },
            revision,
            signal,
            onFinish,
        );
    }

    async function* iterateThumbnails(
        nodeUids: string[],
        thumbnailType?: ThumbnailType,
        signal?: AbortSignal,
    ): AsyncGenerator<ThumbnailResult> {
        const thumbnailDownloader = new ThumbnailDownloader(telemetry, nodesService, api, cryptoService);
        yield* thumbnailDownloader.iterateThumbnails(nodeUids, thumbnailType, signal);
    }

    return {
        getFileDownloader,
        getFileRevisionDownloader,
        iterateThumbnails,
    };
}
