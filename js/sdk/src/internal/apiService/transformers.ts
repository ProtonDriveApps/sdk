import { Logger, NodeType, MemberRole } from '../../interface';

enum ShareTargetType {
    Root = 0,
    Folder = 1,
    File = 2,
    Album = 3,
    Photo = 4,
    ProtonVendor = 5,
}

export function nodeTypeNumberToNodeType(
    logger: Logger,
    nodeTypeNumber: number,
    shareTargetType?: ShareTargetType,
): NodeType {
    switch (nodeTypeNumber) {
        case 1:
            return NodeType.Folder;
        case 2:
            if (shareTargetType === ShareTargetType.Album || shareTargetType === ShareTargetType.Photo) {
                return NodeType.Photo;
            }
            return NodeType.File;
        case 3:
            return NodeType.Album;
        default:
            logger.warn(`Unknown node type: ${nodeTypeNumber}`);
            return NodeType.File;
    }
}

export function permissionsToMemberRole(logger: Logger, permissionsNumber?: number): MemberRole {
    switch (permissionsNumber) {
        case undefined:
            return MemberRole.Inherited;
        case 4:
            return MemberRole.Viewer;
        case 6:
            return MemberRole.Editor;
        case 22:
            return MemberRole.Admin;
        default:
            // User have access to the data, thus at minimum it can view.
            logger.warn(`Unknown sharing permissions: ${permissionsNumber}`);
            return MemberRole.Viewer;
    }
}

export function memberRoleToPermission(memberRole: MemberRole): 4 | 6 | 22 {
    if (memberRole === MemberRole.Inherited) {
        // This is developer error.
        throw new Error('Cannot convert inherited role to permission');
    }
    switch (memberRole) {
        case MemberRole.Viewer:
            return 4;
        case MemberRole.Editor:
            return 6;
        case MemberRole.Admin:
            return 22;
    }
}
