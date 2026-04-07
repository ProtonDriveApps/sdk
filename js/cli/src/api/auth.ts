import bcrypt from 'bcryptjs';

import { Logger } from '@protontech/drive-sdk';

import { Credentials } from '../credentials';
import { VERIFICATION_STATUS } from '../crypto/lib';
import { type ApiInterface as CryptoApiInterface } from '../crypto/lib/worker/api';
import { uint8ArrayToBinaryString, binaryStringToUint8Array, mergeUint8Arrays } from '../crypto/lib/utils';
import { generateProofs } from '../srp/lib/srp';
import { expandHash } from '../srp/lib/passwords';
import { BCRYPT_PREFIX, SRP_LEN, SRP_MODULUS_KEY } from '../srp/lib/constants';
import { AccountApi, AccountApiError } from './accountApi';
import {
    FORK_INITIAL_DELAY_MS,
    FORK_MAX_POLL_TIME_MS,
    FORK_POLL_INTERVAL_MS,
    generateSignInUrl,
    parseUserKeyPassword,
} from './authWeb';
import { sleepMs } from './sleep';

export class Auth {
    constructor(
        private readonly cryptoApi: CryptoApiInterface,
        private readonly accountApi: AccountApi,
        private readonly credentials: Credentials,
        private readonly logger: Logger,
    ) {}

    isLoggedIn(): boolean {
        return this.credentials.isLoggedIn();
    }

    async loadSession(): Promise<void> {
        await this.credentials.load();
    }

    async logout(): Promise<void> {
        await this.credentials.signOut();
    }

    async authViaPassword(
        username: string,
        password: string,
    ): Promise<{
        uid: string;
        accessToken: string;
        refreshToken?: string;
    }> {
        this.logger.debug('Getting auth info');
        const info = await this.accountApi.info(username);

        const publicKey = await this.cryptoApi.importPublicKey({ armoredKey: SRP_MODULUS_KEY });
        const modulusResult = await this.cryptoApi.verifyCleartextMessage({
            armoredCleartextMessage: info.Modulus || '',
            verificationKeys: publicKey,
        });

        if (modulusResult.verificationStatus !== VERIFICATION_STATUS.SIGNED_AND_VALID) {
            throw new Error('Failed to verify auth response');
        }

        this.logger.debug('Generating proofs');
        const results = await this.generateAuthProofs({
            loginPassword: password,
            modulusData: modulusResult.data,
            serverEphemeral: info.ServerEphemeral || '',
            salt: info.Salt || '',
        });

        this.logger.debug('Authenticating');
        const authResponse = await this.accountApi.auth({
            Username: username,
            SRPSession: info.SRPSession || '',
            PersistentCookies: 1,
            Payload: {},
            ClientProof: results.clientProof,
            ClientEphemeral: results.clientEphemeral,
        });

        if (!authResponse.ServerProof) {
            throw new Error('Missing ServerProof');
        }
        if (authResponse.ServerProof !== results.expectedServerProof) {
            throw new Error('Server proof verification failed');
        }
        if (!authResponse.UID || !authResponse.AccessToken) {
            throw new Error('Missing UID or AccessToken');
        }

        await this.credentials.setSessionInfo({
            uid: authResponse.UID,
            accessToken: authResponse.AccessToken,
            ...(authResponse.RefreshToken !== undefined && { refreshToken: authResponse.RefreshToken }),
        });

        this.logger.debug(`Getting user key password`);
        const userKeyPassword = await this.getUserKeyPassword(password);

        await this.credentials.setUserKeyPassword(userKeyPassword);

        return {
            uid: authResponse.UID,
            accessToken: authResponse.AccessToken,
            refreshToken: authResponse.RefreshToken,
        };
    }

    private async generateAuthProofs(params: {
        loginPassword: string;
        modulusData: string;
        serverEphemeral: string;
        salt: string;
    }): Promise<{
        clientEphemeral: string;
        clientProof: string;
        expectedServerProof: string;
    }> {
        const modulusArray = Uint8Array.fromBase64(params.modulusData) as Uint8Array<ArrayBuffer>;
        const serverEphemeralArray = Uint8Array.fromBase64(params.serverEphemeral) as Uint8Array<ArrayBuffer>;
        const saltBytes = Uint8Array.fromBase64(params.salt);
        const saltBinary = binaryStringToUint8Array(`${uint8ArrayToBinaryString(saltBytes)}proton`);
        const unexpandedHash = await bcrypt.hash(
            params.loginPassword,
            BCRYPT_PREFIX + bcrypt.encodeBase64(saltBinary, 16),
        );
        const hashedPasswordArray = await expandHash(
            this.cryptoApi,
            mergeUint8Arrays([binaryStringToUint8Array(unexpandedHash), modulusArray]),
        );

        const { clientEphemeral, clientProof, expectedServerProof } = await generateProofs(this.cryptoApi, {
            byteLength: SRP_LEN,
            modulusArray,
            hashedPasswordArray,
            serverEphemeralArray,
        });

        const results = {
            clientEphemeral: clientEphemeral.toBase64(),
            clientProof: clientProof.toBase64(),
            expectedServerProof: expectedServerProof.toBase64(),
        };

        return results;
    }

    private async getUserKeyPassword(loginPassword: string): Promise<string> {
        const salts = await this.accountApi.salts();
        const userKeySalt = salts.KeySalts?.at(0)?.KeySalt;
        if (!userKeySalt) {
            throw new Error('Missing KeySalt');
        }

        const keyPassword = (
            await bcrypt.hash(
                loginPassword,
                BCRYPT_PREFIX + bcrypt.encodeBase64(Uint8Array.fromBase64(userKeySalt), 16),
            )
        ).slice(29);
        return keyPassword;
    }

    async authViaWeb(
        onSignInUrl: (signInUrl: string) => void | Promise<void>,
        signal?: AbortSignal,
    ): Promise<{
        uid: string;
        accessToken: string;
        refreshToken?: string;
    }> {
        this.logger.debug('Authenticating via web');
        const forkResponse = await this.accountApi.sessionForksInit();

        const { encryptionKey, signInUrl } = generateSignInUrl(forkResponse.UserCode);

        await onSignInUrl(signInUrl);

        await sleepMs(FORK_INITIAL_DELAY_MS, signal);

        const startTime = Date.now();
        while (true) {
            if (Date.now() - startTime > FORK_MAX_POLL_TIME_MS) {
                throw new Error('Authentication timed out');
            }

            this.logger.debug('Checking authentication status');

            let response;
            try {
                response = await this.accountApi.sessionForksStatus(forkResponse.Selector);
            } catch (error) {
                // The API returns 422 if the authentication is not yet ready.
                if (error instanceof AccountApiError && error.httpCode === 422) {
                    this.logger.debug('Authentication not yet ready');
                    await sleepMs(FORK_POLL_INTERVAL_MS, signal);
                    continue;
                }

                throw error;
            }

            const userKeyPassword = parseUserKeyPassword(encryptionKey, response.Payload);

            this.logger.debug('Authentication successful');

            await this.credentials.setUserKeyPassword(userKeyPassword);
            await this.credentials.setSessionInfo({
                uid: response.UID,
                accessToken: response.AccessToken,
                refreshToken: response.RefreshToken,
            });

            return {
                uid: response.UID,
                accessToken: response.AccessToken,
                refreshToken: response.RefreshToken,
            };
        }
    }
}
