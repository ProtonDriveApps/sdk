import { c } from 'ttag';

import { ValidationError } from '../../errors';
import { ReportPublicLinkShareAbuseSettings } from '../../interface';
import { validateReportShareAbuseSettings } from '../reportAbuse';
import { ReportAbuseAPIService } from '../reportAbuse/apiService';
import { splitNodeRevisionUid, splitNodeUid } from '../uids';
import { SharingPublicNodesAccess } from './nodes';
import { SharingPublicSharesManager } from './shares';

/**
 * Provides abuse reporting functionality for public link shares.
 */
export class SharingPublicReporting {
    constructor(
        private apiService: ReportAbuseAPIService,
        private sharesManager: SharingPublicSharesManager,
        private nodesAccess: SharingPublicNodesAccess,
        private url: string,
        // Decrypted during session auth and injected here, so they stay scoped
        // to this module instead of being exposed on the shares manager.
        private sharePassphrase: string,
        private shareUrlPassword: string,
    ) {
        this.apiService = apiService;
        this.sharesManager = sharesManager;
        this.nodesAccess = nodesAccess;
        this.url = url;
        this.sharePassphrase = sharePassphrase;
        this.shareUrlPassword = shareUrlPassword;
    }

    async reportAbuse(settings: ReportPublicLinkShareAbuseSettings): Promise<void> {
        validateReportShareAbuseSettings(settings);

        const { rootNodeUid } = await this.sharesManager.getRootIDs();
        const rootNode = await this.nodesAccess.getNode(rootNodeUid);
        if (!rootNode.shareId) {
            throw new ValidationError(c('Error').t`Node is not accessible via a share`);
        }

        let linkId: string | undefined;
        let revisionId: string | undefined;

        if (settings.nodeUid) {
            linkId = splitNodeUid(settings.nodeUid).nodeId;
        }
        if (settings.revisionUid) {
            const parts = splitNodeRevisionUid(settings.revisionUid);
            linkId = linkId ?? parts.nodeId;
            revisionId = parts.revisionId;
        }

        await this.apiService.reportAbuse({
            sharePassphrase: this.sharePassphrase,
            shareId: rootNode.shareId,
            abuseCategory: settings.abuseCategory,
            bonaFide: settings.bonaFide,
            reporterMessage: settings.reporterMessage,
            reporterEmail: settings.reporterEmail,
            shareUrl: this.url,
            shareUrlPassword: this.shareUrlPassword,
            linkId,
            revisionId,
        });
    }
}
