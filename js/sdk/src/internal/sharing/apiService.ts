import { DriveAPIService } from "../apiService/index.js";

export function sharingAPIService(apiService: DriveAPIService) {
    // TODO: types
    async function *iterateSharedNodes(volumeId: string): any {
        // TODO: /drive/v2/volumes/{volumeID}/shares
    }

    async function *iterateSharedWithMe(): any {
        // TODO: /drive/v2/sharedwithme
    }

    async function *iterateInvitations() {
        // TODO: /drive/v2/shares/invitations
    }

    async function *iterateBookmarks() {
        // TODO: /drive/v2/shared-bookmarks
    }

    async function inviteProtonUser(object: any) {
    }

    return {
        iterateSharedNodes,
        iterateSharedWithMe,
        iterateInvitations,
        iterateBookmarks,
        inviteProtonUser,
    }
}
