import { PrivateKey, SessionKey } from "../../crypto";
import { NodeEntity } from "../../interface";

export interface NodesService {
    getNode(nodeUid: string): Promise<NodeEntity>,
    getNodeKeys(nodeUid: string): Promise<{ key: PrivateKey, sessionKey: SessionKey }>,
}
