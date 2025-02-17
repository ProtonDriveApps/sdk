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

export function makeInvitationUid(volumeId: string, invitationId: string) {
    return `volume:${volumeId};invitation:${invitationId}`;
}
