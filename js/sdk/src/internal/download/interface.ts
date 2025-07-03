import { PrivateKey, PublicKey, SessionKey } from "../../crypto";
import { NodeType, Result, Revision, MissingNode, MetricVolumeType } from "../../interface";
import { DecryptedNode } from "../nodes";

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

export interface SharesService {
    getVolumeMetricContext(volumeId: string): Promise<MetricVolumeType>,
}

export interface NodesService {
    getNode(nodeUid: string): Promise<NodesServiceNode>,
    getNodeKeys(nodeUid: string): Promise<{ key: PrivateKey, contentKeyPacketSessionKey?: SessionKey; }>,
    iterateNodes(nodeUids: string[], signal?: AbortSignal): AsyncGenerator<DecryptedNode | MissingNode>;
}

export interface NodesServiceNode {
    uid: string,
    type: NodeType,
    activeRevision?: Result<Revision, Error>,
}

export interface RevisionsService {
    getRevision(nodeRevisionUid: string): Promise<Revision>,
}
