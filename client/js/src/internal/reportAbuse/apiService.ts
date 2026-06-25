import { DriveAPIService, drivePaths } from '../apiService';

type PostReportShareAbuseRequest = Extract<
    drivePaths['/drive/report/share']['post']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostReportShareAbuseResponse =
    drivePaths['/drive/report/share']['post']['responses']['200']['content']['application/json'];

/**
 * Provides the API call for reporting a share for abuse.
 *
 * Shared by the direct share (`sharing`) and public link (`sharingPublic`)
 * reporting flows so the endpoint is implemented in one place.
 */
export class ReportAbuseAPIService {
    constructor(private apiService: DriveAPIService) {
        this.apiService = apiService;
    }

    async reportAbuse(report: {
        sharePassphrase: string;
        memberSessionKey?: string;
        shareId: string;
        abuseCategory: PostReportShareAbuseRequest['AbuseCategory'];
        bonaFide: true;
        reporterMessage?: string;
        reporterEmail?: string;
        shareUrl?: string;
        shareUrlPassword?: string;
        linkId?: string;
        revisionId?: string;
    }): Promise<void> {
        await this.apiService.post<PostReportShareAbuseRequest, PostReportShareAbuseResponse>(`drive/report/share`, {
            SharePassphrase: new TextEncoder().encode(report.sharePassphrase).toBase64(),
            MemberSessionKey: report.memberSessionKey ?? null,
            ShareID: report.shareId,
            AbuseCategory: report.abuseCategory,
            BonaFide: report.bonaFide,
            ReporterMessage: report.reporterMessage ?? null,
            ReporterEmail: report.reporterEmail ?? null,
            ShareURL: report.shareUrl ?? null,
            ShareURLPassword: report.shareUrlPassword ?? null,
            LinkID: report.linkId ?? null,
            RevisionID: report.revisionId ?? null,
        });
    }
}
