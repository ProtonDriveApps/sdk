import { PrivateKey, PublicKey, SessionKey } from "../../crypto";
import { NodeEntity, Revision } from "../../interface";

export type BlockMetadata = {
    index: number,
    bareUrl: string,
    token: string,
    base64sha256Hash: string,
    signatureEmail?: string,
    armoredSignature?: string,
};

export type RevisionKeys = {
    key: PrivateKey,
    contentKeyPacketSessionKey: SessionKey,
    verificationKeys?: PublicKey[],
}

export interface NodesService {
    getNode(nodeUid: string): Promise<NodeEntity>,
    getNodeKeys(nodeUid: string): Promise<{ key: PrivateKey, contentKeyPacketSessionKey?: SessionKey; }>,
}

export interface RevisionsService {
    getRevision(nodeRevisionUid: string): Promise<Revision>,
}
