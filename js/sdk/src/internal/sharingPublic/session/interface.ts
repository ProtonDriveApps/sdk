export type PublicLinkInfo = {
    srp: PublicLinkSrpInfo;
    isCustomPasswordProtected: boolean;
    isLegacy: boolean;
    vendorType: number;
};

export type PublicLinkSrpInfo = {
    version: number;
    modulus: string;
    serverEphemeral: string;
    salt: string;
    srpSession: string;
};

export type PublicLinkSrpAuth = {
    clientProof: string;
    clientEphemeral: string;
    srpSession: string;
};
