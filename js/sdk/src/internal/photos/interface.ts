import { MissingNode } from "../../interface";
import { DecryptedNode } from "../nodes";

export interface NodesService {
    getNode(nodeUid: string): Promise<DecryptedNode>;
    iterateNodes(nodeUids: string[], signal?: AbortSignal): AsyncGenerator<DecryptedNode | MissingNode>;
}
