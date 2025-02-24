import { NodeType } from "../../interface";
import { DriveAPIService, drivePaths } from "../apiService";
import { makeNodeUid, makeInvitationUid } from "../uids";
import { EncryptedBookmark } from "./interface";

type GetSharedNodesResponse = drivePaths['/drive/v2/volumes/{volumeID}/shares']['get']['responses']['200']['content']['application/json'];

type GetSharedWithMeNodesResponse = drivePaths['/drive/v2/sharedwithme']['get']['responses']['200']['content']['application/json'];

type GetInvitationsResponse = drivePaths['/drive/v2/shares/invitations']['get']['responses']['200']['content']['application/json'];

type GetSharedBookmarksResponse = drivePaths['/drive/v2/shared-bookmarks']['get']['responses']['200']['content']['application/json'];

export class SharingAPIService {
    constructor(private apiService: DriveAPIService) {
        this.apiService = apiService;
    }

    async *iterateSharedNodeUids(volumeId: string, signal?: AbortSignal): AsyncGenerator<string> {
        let anchor = "";
        while (true) {
            const response = await this.apiService.get<GetSharedNodesResponse>(`drive/v2/volumes/${volumeId}/shares?${anchor ? `AnchorID=${anchor}` : ''}`, signal);
            for (const link of response.Links) {
                yield makeNodeUid(volumeId, link.LinkID);
            }
    
            if (!response.More || !response.AnchorID) {
                break;
            }
            anchor = response.AnchorID;
        }
    }

    async *iterateSharedWithMeNodeUids(signal?: AbortSignal): AsyncGenerator<string> {
        let anchor = "";
        while (true) {
            const response = await this.apiService.get<GetSharedWithMeNodesResponse>(`drive/v2/sharedwithme?${anchor ? `AnchorID=${anchor}` : ''}`, signal);
            for (const link of response.Links) {
                yield makeNodeUid(link.VolumeID, link.LinkID);
            }
    
            if (!response.More || !response.AnchorID) {
                break;
            }
            anchor = response.AnchorID;
        }
    }

    async *iterateInvitationUids(signal?: AbortSignal): AsyncGenerator<string> {
        let anchor = "";
        while (true) {
            const response = await this.apiService.get<GetInvitationsResponse>(`drive/v2/shares/invitations?${anchor ? `AnchorID=${anchor}` : ''}`, signal);
            for (const invitation of response.Invitations) {
                yield makeInvitationUid(invitation.VolumeID, invitation.InvitationID);
            }
    
            if (!response.More || !response.AnchorID) {
                break;
            }
            anchor = response.AnchorID;
        }
    }

    async *iterateBookmarks(signal?: AbortSignal): AsyncGenerator<EncryptedBookmark> {
        const response = await this.apiService.get<GetSharedBookmarksResponse>(`drive/v2/shared-bookmarks`, signal);
        for (const bookmark of response.Bookmarks) {
            yield {
                tokenId: bookmark.Token.Token,
                createdDate: new Date(bookmark.CreateTime*1000),
                share: {
                    armoredKey: bookmark.Token.ShareKey,
                    armoredPassphrase: bookmark.Token.SharePassphrase,
                },
                url: {
                    encryptedUrlPassword: bookmark.EncryptedUrlPassword || undefined,
                    base64SharePasswordSalt: bookmark.Token.SharePasswordSalt,
                },
                node: {
                    type: bookmark.Token.LinkType === 1 ? NodeType.Folder : NodeType.File,
                    mimeType: bookmark.Token.MIMEType,
                    encryptedName: bookmark.Token.Name,
                    armoredKey: bookmark.Token.NodeKey,
                    armoredNodePassphrase: bookmark.Token.NodePassphrase,
                    file: {
                        base64ContentKeyPacket: bookmark.Token.ContentKeyPacket || undefined,
                    },
                },
            }
        }
    }

    async inviteProtonUser(object: any) {
    }
}
