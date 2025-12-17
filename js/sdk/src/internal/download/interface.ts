import { PrivateKey, PublicKey, SessionKey } from '../../crypto';
import { IntegrityError } from '../../errors';
import { NodeType, Result, MissingNode, MetricVolumeType } from '../../interface';
import { DecryptedNode, DecryptedRevision } from '../nodes';

export type BlockMetadata = {
    index: number;
    bareUrl: string;
    token: string;
    base64sha256Hash: string;
    signatureEmail?: string;
};

export type RevisionKeys = {
    key: PrivateKey;
    contentKeyPacketSessionKey: SessionKey;
    verificationKeys?: PublicKey[];
};

export interface SharesService {
    getVolumeMetricContext(volumeId: string): Promise<MetricVolumeType>;
}

export interface NodesService {
    getNode(nodeUid: string): Promise<NodesServiceNode>;
    getNodeKeys(nodeUid: string): Promise<{ key: PrivateKey; contentKeyPacketSessionKey?: SessionKey }>;
    iterateNodes(nodeUids: string[], signal?: AbortSignal): AsyncGenerator<DecryptedNode | MissingNode>;
}

export interface NodesServiceNode {
    uid: string;
    type: NodeType;
    activeRevision?: Result<DecryptedRevision, Error>;
}

export interface RevisionsService {
    getRevision(nodeRevisionUid: string): Promise<DecryptedRevision>;
}

/**
 * Error thrown when the manifest signature verification fails.
 * This is a special case that is reported as download complete with signature
 * issues. The client must then ask the user to agree to save the file anyway
 * or abort and clean up the file.
 *
 * This error is not exposed to the client. It is only used internally to track
 * the signature verification issues. For the client it must be reported as
 * the IntegrityError.
 */
export class SignatureVerificationError extends IntegrityError {
    name = 'SignatureVerificationError';
}
