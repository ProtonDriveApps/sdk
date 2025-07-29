export function makeDeviceUid(volumeId: string, deviceId: string) {
    return `${volumeId}~${deviceId}`;
}

export function splitDeviceUid(deviceUid: string) {
    const parts = deviceUid.split('~');
    if (parts.length !== 2) {
        throw new Error(`"${deviceUid}" is not valid device UID`);
    }
    const [volumeId, deviceId] = parts;
    return { volumeId, deviceId };
}

export function makeNodeUid(volumeId: string, nodeId: string) {
    return makeUid(volumeId, nodeId);
}

export function splitNodeUid(nodeUid: string) {
    const [volumeId, nodeId] = splitUid(nodeUid, 2, 'node');
    return { volumeId, nodeId };
}

export function makeNodeRevisionUid(volumeId: string, nodeId: string, revisionId: string) {
    return makeUid(volumeId, nodeId, revisionId);
}

export function splitNodeRevisionUid(nodeRevisionUid: string) {
    const [volumeId, nodeId, revisionId] = splitUid(nodeRevisionUid, 3, 'revision');
    return { volumeId, nodeId, revisionId };
}

export function makeNodeUidFromRevisionUid(nodeRevisionUid: string) {
    const { volumeId, nodeId } = splitNodeRevisionUid(nodeRevisionUid);
    return makeNodeUid(volumeId, nodeId);
}

export function makeNodeThumbnailUid(volumeId: string, nodeId: string, thumbnailId: string) {
    return makeUid(volumeId, nodeId, thumbnailId);
}

export function splitNodeThumbnailUid(nodeThumbnailUid: string) {
    const [volumeId, nodeId, thumbnailId] = splitUid(nodeThumbnailUid, 3, 'thumbnail');
    return { volumeId, nodeId, thumbnailId };
}

export function makeInvitationUid(shareId: string, invitationId: string) {
    return makeUid(shareId, invitationId);
}

export function splitInvitationUid(invitationUid: string) {
    const [shareId, invitationId] = splitUid(invitationUid, 2, 'invitation');
    return { shareId, invitationId };
}

export function makeMemberUid(shareId: string, memberId: string) {
    return makeUid(shareId, memberId);
}

export function splitMemberUid(memberUid: string) {
    const [shareId, memberId] = splitUid(memberUid, 2, 'member');
    return { shareId, memberId };
}

export function makePublicLinkUid(shareId: string, publicLinkId: string) {
    return makeUid(shareId, publicLinkId);
}

export function splitPublicLinkUid(publicLinkUid: string) {
    const [shareId, publicLinkId] = splitUid(publicLinkUid, 2, 'public link');
    return { shareId, publicLinkId };
}

function makeUid(...parts: string[]): string {
    return parts.join('~');
}

function splitUid(uid: string, expectedParts: number, typeName: string): string[] {
    const parts = uid.split('~');
    if (parts.length !== expectedParts) {
        throw new Error(`"${uid}" is not a valid ${typeName} UID`);
    }
    return parts;
}
