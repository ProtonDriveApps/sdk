import { DriveAPIService, drivePaths } from '../apiService';

type PostTokenInfoRequest = Extract<
    drivePaths['/drive/v2/urls/{token}/bookmark']['post']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostTokenInfoResponse =
    drivePaths['/drive/v2/urls/{token}/bookmark']['post']['responses']['200']['content']['application/json'];

type PostMalwareScanRequest = Extract<
    drivePaths['/drive/urls/{token}/security']['post']['requestBody'],
    { content: object }
>['content']['application/json'];
type PostMalwareScanResponse =
    drivePaths['/drive/urls/{token}/security']['post']['responses']['200']['content']['application/json'];
/**
 * Provides API communication for actions on the public link.
 *
 * The service is responsible for transforming local objects to API payloads
 * and vice versa. It should not contain any business logic.
 */
export class SharingPublicAPIService {
    constructor(private apiService: DriveAPIService) {
        this.apiService = apiService;
    }

    async bookmarkPublicLink(bookmark: {
        token: string;
        encryptedUrlPassword: string;
        addressId: string;
        addressKeyId: string;
    }): Promise<void> {
        await this.apiService.post<PostTokenInfoRequest, PostTokenInfoResponse>(
            `drive/v2/urls/${bookmark.token}/bookmark`,
            {
                BookmarkShareURL: {
                    EncryptedUrlPassword: bookmark.encryptedUrlPassword,
                    AddressID: bookmark.addressId,
                    AddressKeyID: bookmark.addressKeyId,
                },
            },
        );
    }

    async malwareScan(token: string, hashes: string[]) {
        return this.apiService.post<PostMalwareScanRequest, PostMalwareScanResponse>(`drive/urls/${token}/security`, {
            Hashes: hashes,
        });
    }
}
