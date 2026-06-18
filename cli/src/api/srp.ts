import { computeKeyPassword, generateKeySalt, getRandomSrpVerifier, getSrp } from '@protontech/crypto/srp';

import { AccountApi } from './accountApi';

export class Srp {
    constructor(
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

    generateKeySalt(): string {
        return generateKeySalt();
    }
}
