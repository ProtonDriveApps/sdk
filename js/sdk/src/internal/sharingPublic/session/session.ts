import { SRPModule } from "../../../crypto";
import { SharingPublicSessionAPIService } from "./apiService";
import { PublicLinkInfo, PublicLinkSrpInfo } from "./interface";

/**
 * Session for a public link.
 *
 * It is responsible for initializing and authenticating the public link session
 * with the SRP handshake. It also can re-authenticate the session if it is expired.
 */
export class SharingPublicLinkSession {
    private sessionUid?: string;
    private sessionAccessToken?: string;

    constructor(
        private apiService: SharingPublicSessionAPIService,
        private srpModule: SRPModule,
        private token: string,
        private password: string,
    ) {
        this.apiService = apiService;
        this.srpModule = srpModule;
        this.token = token;
        this.password = password;
    }

    async reauth(): Promise<void> {
        const info = await this.init();
        await this.auth(info.srp);
    }

    async init(): Promise<PublicLinkInfo> {
        return this.apiService.initPublicLinkSession(this.token);
    }

    async auth(srp: PublicLinkSrpInfo): Promise<void> {
        const { expectedServerProof, clientProof, clientEphemeral } = await this.srpModule.getSrp(
            srp.version,
            srp.modulus,
            srp.serverEphemeral,
            srp.salt,
            this.password,
        );

        const auth = await this.apiService.authPublicLinkSession(this.token, {
            clientProof,
            clientEphemeral,
            srpSession: srp.srpSession,
        });

        if (auth.serverProof !== expectedServerProof) {
            throw new Error('Invalid server proof');
        }

        this.sessionUid = auth.sessionUid;
        this.sessionAccessToken = auth.sessionAccessToken;
    }

    /**
     * Get the session uid and access token.
     *
     * The access token is only returned if the session is newly created.
     * If the access token is not available, it means the existing session
     * can be used to access the public link.
     *
     * @throws If the session is not initialized.
     */
    get session() {
        if (!this.sessionUid) {
            throw new Error('Session not initialized');
        }

        return {
            uid: this.sessionUid,
            accessToken: this.sessionAccessToken,
        };
    }
}
