import { Logger } from '@protontech/drive-sdk';

import type { Config } from '../config';
import type { Credentials } from '../credentials';
import { type ApiInterface as CryptoApiInterface } from '../crypto/lib/worker/api';
import { AccountApi } from './accountApi';
import { Addresses } from './addresses';
import { ApiClient } from './apiClient';
import { Auth } from './auth';
import { HTTPClient } from './httpClient';
import { Srp } from './srp';

export type { Addresses } from './addresses';
export type { Auth } from './auth';
export type { Srp } from './srp';

export async function initApi(config: Config, cryptoApi: CryptoApiInterface, credentials: Credentials, logger: Logger) {
    const apiClient = new ApiClient(config, credentials, logger);
    const accountApi = new AccountApi(apiClient);
    const addresses = new Addresses(cryptoApi, accountApi, credentials, logger);
    const auth = new Auth(cryptoApi, accountApi, credentials, logger);
    const srp = new Srp(cryptoApi, accountApi);
    const httpClient = new HTTPClient(apiClient);

    await auth.loadSession();

    return {
        credentials,
        addresses,
        auth,
        srp,
        httpClient,
    };
}
