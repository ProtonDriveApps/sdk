import type { CryptoApiInterface } from '@protontech/crypto';

import { AccountApi } from './accountApi';
import { Addresses } from './addresses';
import { ApiClient } from './apiClient';
import { Auth } from './auth';
import type { Logger } from './logger';
import type { SessionCredentials } from './sessionCredentials';
import { Srp } from './srp';

export type { AccountAddress } from './accountAddress';
export { AccountApi, AccountApiError, AddressNotFoundError } from './accountApi';
export { Addresses } from './addresses';
export type { ApiClientOptions } from './apiClient';
export { ApiClient } from './apiClient';
export { Auth } from './auth';
export type { Logger } from './logger';
export type { SessionCredentials, SessionInfo } from './sessionCredentials';
export { Srp } from './srp';

export type InitAccountOptions = {
    authClientId: string;
    apiClient: ApiClient;
    credentials: SessionCredentials;
    cryptoProxy: CryptoApiInterface;
    logger: Logger;
};

export async function initAccount(options: InitAccountOptions) {
    const accountApi = new AccountApi(options.apiClient);
    const addresses = new Addresses(accountApi, options.credentials, options.cryptoProxy, options.logger);
    const auth = new Auth(options.authClientId, accountApi, options.credentials, options.logger);
    const srp = new Srp(accountApi);

    await auth.loadSession();

    return {
        addresses,
        auth,
        srp,
        apiClient: options.apiClient,
        accountApi,
    };
}
