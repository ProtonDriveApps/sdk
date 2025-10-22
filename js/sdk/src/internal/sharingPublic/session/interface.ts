import { MemberRole } from '../../../interface';

export type PublicLinkInfo = {
    srp: PublicLinkSrpInfo;
    isCustomPasswordProtected: boolean;
    isLegacy: boolean;
    vendorType: number;
    directAccess?: {
        nodeUid: string;
        directRole: MemberRole;
        publicRole: MemberRole;
    };
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

export type PublicLinkSession = {
    serverProof: string;
    sessionUid: string;
    sessionAccessToken?: string;
};

export type EncryptedShareCrypto = {
    base64UrlPasswordSalt: string;
    armoredKey: string;
    armoredPassphrase: string;
    publicRole: MemberRole;
};
