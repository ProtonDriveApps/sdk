import { type ApiInterface as CryptoApiInterface } from '../crypto/lib/worker/api';
import { getSrp, getRandomSrpVerifier } from '../srp/lib/srp';
import { computeKeyPassword } from '../srp/lib/keys';
import { AccountApi } from './accountApi';

export class Srp {
    constructor(
        private readonly cryptoApi: CryptoApiInterface,
        private readonly accountApi: AccountApi,
    ) {}

    async getSrp(
        version: number,
        modulus: string,
        serverEphemeral: string,
        salt: string,
        password: string,
    ): Promise<{
        expectedServerProof: string;
        clientProof: string;
        clientEphemeral: string;
    }> {
        return getSrp(
            this.cryptoApi,
            {
                Version: version,
                Modulus: modulus,
                ServerEphemeral: serverEphemeral,
                Salt: salt,
            },
            { password },
        );
    }

    async getSrpVerifier(password: string) {
        const result = await this.accountApi.modulus();
        if (!result.Modulus || !result.ModulusID) {
            throw new Error('Missing modulus');
        }

        const { version, salt, verifier } = await getRandomSrpVerifier(
            this.cryptoApi,
            {
                Modulus: result.Modulus,
            },
            { password },
        );
        return {
            modulusId: result.ModulusID,
            version,
            salt,
            verifier,
        };
    }

    async computeKeyPassword(password: string, salt: string) {
        return await computeKeyPassword(password, salt);
    }
}
