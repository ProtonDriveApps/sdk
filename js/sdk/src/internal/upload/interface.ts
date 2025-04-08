import { PrivateKey, SessionKey } from "../../crypto";

export interface NodesService {
    getNodeKeys(nodeUid: string): Promise<{ key: PrivateKey, passphraseSessionKey: SessionKey }>,
}
