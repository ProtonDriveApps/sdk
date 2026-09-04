import type { computeKeyPassword, generateKeySalt, getRandomSrpVerifier, getSrp } from '@protontech/crypto/srp';

import { AccountApi } from './accountApi';

/**
 * SRP primitives of `@protontech/crypto`, provided by the application.
 *
 * They must be injected instead of imported: the crypto package keeps its
 * endpoint in module-level state, so a copy of the package resolved from
 * this module would use an endpoint the application never initialised.
 */
export type SrpApiInterface = {
    computeKeyPassword: typeof computeKeyPassword;
    generateKeySalt: typeof generateKeySalt;
    getRandomSrpVerifier: typeof getRandomSrpVerifier;
    getSrp: typeof getSrp;
};

export class Srp {
    constructor(
        private readonly accountApi: AccountApi,
        private readonly srpApi: SrpApiInterface,
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
        return this.srpApi.getSrp(
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

        const { version, salt, verifier } = await this.srpApi.getRandomSrpVerifier(
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
        return await this.srpApi.computeKeyPassword(password, salt);
    }

    generateKeySalt(): string {
        return this.srpApi.generateKeySalt();
    }
}
