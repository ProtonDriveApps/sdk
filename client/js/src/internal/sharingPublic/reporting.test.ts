import { ValidationError } from '../../errors';
import { AbuseCategory } from '../../interface';
import { ReportAbuseAPIService } from '../reportAbuse/apiService';
import { SharingPublicNodesAccess } from './nodes';
import { SharingPublicReporting } from './reporting';
import { SharingPublicSharesManager } from './shares';

describe('SharingPublicReporting', () => {
    const url = 'https://drive.proton.me/urls/token#password';

    let apiService: ReportAbuseAPIService;
    let sharesManager: SharingPublicSharesManager;
    let nodesAccess: SharingPublicNodesAccess;
    let reporting: SharingPublicReporting;

    beforeEach(() => {
        // @ts-expect-error No need to implement all methods for mocking
        apiService = {
            reportAbuse: jest.fn().mockResolvedValue(undefined),
        };
        // @ts-expect-error No need to implement all methods for mocking
        sharesManager = {
            getRootIDs: jest.fn().mockResolvedValue({ rootNodeUid: 'volumeId~rootNodeId' }),
        };
        // @ts-expect-error No need to implement all methods for mocking
        nodesAccess = {
            getNode: jest.fn().mockResolvedValue({ shareId: 'shareId' }),
        };

        reporting = new SharingPublicReporting(
            apiService,
            sharesManager,
            nodesAccess,
            url,
            'sharePassphrase',
            'urlPassword',
        );
    });

    it('should report abuse with the share url and password', async () => {
        await reporting.reportAbuse({ abuseCategory: AbuseCategory.Spam, bonaFide: true });

        expect(apiService.reportAbuse).toHaveBeenCalledWith({
            sharePassphrase: 'sharePassphrase',
            shareId: 'shareId',
            abuseCategory: AbuseCategory.Spam,
            bonaFide: true,
            reporterMessage: undefined,
            reporterEmail: undefined,
            shareUrl: url,
            shareUrlPassword: 'urlPassword',
            linkId: undefined,
            revisionId: undefined,
        });
    });

    it('should report a specific node and revision when provided', async () => {
        await reporting.reportAbuse({
            abuseCategory: AbuseCategory.Spam,
            bonaFide: true,
            revisionUid: 'volumeId~nodeId~revisionId',
        });

        expect(apiService.reportAbuse).toHaveBeenCalledWith(
            expect.objectContaining({ linkId: 'nodeId', revisionId: 'revisionId' }),
        );
    });

    it('should throw and not call the API when a required message is missing', async () => {
        await expect(reporting.reportAbuse({ abuseCategory: AbuseCategory.Copyright, bonaFide: true })).rejects.toThrow(
            ValidationError,
        );
        expect(apiService.reportAbuse).not.toHaveBeenCalled();
    });
});
