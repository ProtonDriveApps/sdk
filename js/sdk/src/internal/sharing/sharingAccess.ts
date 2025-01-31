import { ProtonDriveAccount } from "../../interface/index.js";
import { sharingAPIService } from "./apiService.js";
import { sharingCryptoService } from "./cryptoService.js";
import { NodesService } from "./interface.js";

export function sharingAccess(
    apiService: ReturnType<typeof sharingAPIService>,
    cryptoService: ReturnType<typeof sharingCryptoService>,
    nodesService: NodesService,
) {
    async function* iterateSharedNodes() {
        // TODO: get volume from shares module
        const volumeId = 'myFiles';
        for await (const sharedNode of apiService.iterateSharedNodes(volumeId)) {
            yield await nodesService.getNode(sharedNode.nodeUid);
        }
    }

    async function* iterateSharedNodesWithMe() {
        for await (const sharedNode of apiService.iterateSharedWithMe()) {
            yield await nodesService.getNode(sharedNode.nodeUid);
        }
    }

    async function* iterateInvitations() {
        for await (const invitation of apiService.iterateInvitations()) {
            yield invitation;
        }
    }

    async function* iterateSharedBookmarks() {
        for await (const bookmark of apiService.iterateBookmarks()) {
            yield bookmark;
        }
    }

    return {
        iterateSharedNodes,
        iterateSharedNodesWithMe,
        iterateInvitations,
        iterateSharedBookmarks,
    }
}
