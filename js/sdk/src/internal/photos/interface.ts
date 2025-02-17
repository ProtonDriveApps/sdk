import { NodeEntity } from "../../interface";

export interface NodesService {
    getNode(nodeUid: string): Promise<NodeEntity>;
    iterateNodes(nodeUids: string[], signal?: AbortSignal): AsyncGenerator<NodeEntity>;
}
