import {
    ProtonDriveHTTPClient,
    ProtonDriveHTTPClientBlobRequest,
    ProtonDriveHTTPClientJsonRequest,
} from '../../../interface';
import { HTTPErrorCode } from '../../apiService';
import { SharingPublicLinkSession } from './session';

/**
 * HTTP client to get access to public link of given session.
 *
 * It is responsible for adding the session headers to the request if the session
 * is authenticated, and re-authenticating the session if the session is expired.
 */
export class SharingPublicSessionHttpClient implements ProtonDriveHTTPClient {
    constructor(
        private httpClient: ProtonDriveHTTPClient,
        private session: SharingPublicLinkSession,
    ) {
        this.httpClient = httpClient;
        this.session = session;
    }

    async fetchJson(options: ProtonDriveHTTPClientJsonRequest) {
        const response = await this.httpClient.fetchJson(this.getOptionsWithSessionHeaders(options));

        if (response.status === HTTPErrorCode.UNAUTHORIZED) {
            await this.session.reauth();
            return this.httpClient.fetchJson(this.getOptionsWithSessionHeaders(options));
        }

        return response;
    }

    async fetchBlob(options: ProtonDriveHTTPClientBlobRequest) {
        return this.httpClient.fetchBlob(this.getOptionsWithSessionHeaders(options));
    }

    private getOptionsWithSessionHeaders(options: ProtonDriveHTTPClientJsonRequest) {
        // Set headers if the session is newly created.
        // This is needed only if the user is not logged in.
        if (this.session.session.accessToken) {
            options.headers.set('x-pm-uid', this.session.session.uid);
            options.headers.set('Authorization', `Bearer ${this.session.session.accessToken}`);
        }
        return options;
    }
}
