export function makeDeviceUid(volumeId: string, deviceId: string) {
    return `${volumeId}~${deviceId}`;
}

export function splitDeviceUid(deviceUid: string) {
    const parts = deviceUid.split('~');
    if (parts.length !== 2) {
        throw new Error(`"${deviceUid}" is not valid device UID`);
    }
    const [ volumeId, deviceId ] = parts;
    return { volumeId, deviceId };
}

export function makeNodeUid(volumeId: string, nodeId: string) {
    return `${volumeId}~${nodeId}`;
}

export function splitNodeUid(nodeUid: string) {
    const parts = nodeUid.split('~');
    if (parts.length !== 2) {
        throw new Error(`"${nodeUid}" is not valid node UID`);
    }
    const [ volumeId, nodeId ] = parts;
    return { volumeId, nodeId };
}

export function makeInvitationUid(shareId: string, invitationId: string) {
    return `${shareId}~${invitationId}`;
}

export function splitInvitationUid(invitationUid: string) {
    const parts = invitationUid.split('~');
    if (parts.length !== 2) {
        throw new Error(`"${invitationUid}" is not valid invitation UID`);
    }
    const [ shareId, invitationId ] = parts;
    return { shareId, invitationId };
}

export function makeMemberUid(shareId: string, memberId: string) {
    return `${shareId}~${memberId}`;
}

export function splitMemberUid(memberUid: string) {
    const parts = memberUid.split('~');
    if (parts.length !== 2) {
        throw new Error(`"${memberUid}" is not valid member UID`);
    }
    const [ shareId, memberId ] = parts;
    return { shareId, memberId };
}

export function makePublicLinkUid(shareId: string, publicLinkId: string) {
    return `${shareId}~${publicLinkId}`;
}

export function splitPublicLinkUid(publicLinkUid: string) {
    const parts = publicLinkUid.split('~');
    if (parts.length !== 2) {
        throw new Error(`"${publicLinkUid}" is not valid public link UID`);
    }
    const [ shareId, publicLinkId ] = parts;
    return { shareId, publicLinkId };
}

export function makeNodeRevisionUid(volumeId: string, nodeId: string, revisionId: string) {
    return `${volumeId}~${nodeId}~${revisionId}`;
}

export function splitNodeRevisionUid(nodeRevisionUid: string) {
    const parts = nodeRevisionUid.split('~');
    if (parts.length !== 3) {
        throw new Error(`"${nodeRevisionUid}" is not valid node revision UID`);
    }
    const [ volumeId, nodeId, revisionId ] = parts;
    return { volumeId, nodeId, revisionId };
}

export function makeNodeUidFromRevisionUid(nodeRevisionUid: string) {
    const { volumeId, nodeId } = splitNodeRevisionUid(nodeRevisionUid);
    return makeNodeUid(volumeId, nodeId);
}
