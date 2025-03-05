export function makeNodeUid(volumeId: string, nodeId: string) {
    // TODO: format of UID
    return `volume:${volumeId};node:${nodeId}`;
}

export function splitNodeUid(nodeUid: string) {
    // TODO: validation
    const [ volumeId, nodeId ] = nodeUid.split(';');
    return {
        volumeId: volumeId.slice('volume:'.length),
        nodeId: nodeId.slice('node:'.length),
    };
}

export function makeInvitationUid(shareId: string, invitationId: string) {
    // TODO: format of UID
    return `share:${shareId};invitation:${invitationId}`;
}

export function splitInvitationUid(invitationUid: string) {
    // TODO: validation
    const [ shareId, invitationId ] = invitationUid.split(';');
    return {
        shareId: shareId.slice('share:'.length),
        invitationId: invitationId.slice('invitation:'.length),
    };
}

export function makeMemberUid(shareId: string, memberId: string) {
    // TODO: format of UID
    return `share:${shareId};member:${memberId}`;
}

export function splitMemberUid(memberUid: string) {
    // TODO: validation
    const [ shareId, memberId ] = memberUid.split(';');
    return {
        shareId: shareId.slice('share:'.length),
        memberId: memberId.slice('member:'.length),
    };
}

export function makeNodeRevisionUid(volumeId: string, nodeUid: string, revisionId: string) {
    // TODO: format of UID
    return `volume:${volumeId};node:${nodeUid};revision:${revisionId}`;
}

export function splitNodeRevisionUid(nodeRevisionUid: string) {
    // TODO: validation
    const [ volumeId, nodeId, revisionId ] = nodeRevisionUid.split(';');
    return {
        volumeId: volumeId.slice('volume:'.length),
        nodeId: nodeId.slice('node:'.length),
        revisionId: revisionId.slice('revision:'.length),
    };
}
