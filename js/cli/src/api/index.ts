import { Logger } from '@protontech/drive-sdk';

import type { Config } from '../config';
import type { Credentials } from '../credentials';
import { AccountApi } from './accountApi';
import { Addresses } from './addresses';
import { ApiClient } from './apiClient';
import { Auth } from './auth';
import { HTTPClient } from './httpClient';
import { Srp } from './srp';

export type { Addresses } from './addresses';
export type { ApiClient } from './apiClient';
export type { Auth } from './auth';
export type { Srp } from './srp';

export async function initApi(config: Config, credentials: Credentials, logger: Logger) {
    const apiClient = new ApiClient(config, credentials, logger);
    const accountApi = new AccountApi(apiClient);
    const addresses = new Addresses(accountApi, credentials, logger);
    const auth = new Auth(config.authClientId, accountApi, credentials, logger);
    const srp = new Srp(accountApi);
    const httpClient = new HTTPClient(apiClient);

    await auth.loadSession();

    return {
        credentials,
        addresses,
        auth,
        srp,
        apiClient,
        httpClient,
    };
}
