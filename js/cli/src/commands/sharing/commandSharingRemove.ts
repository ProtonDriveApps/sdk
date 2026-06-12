import { NodeEntity, ProtonDriveClient } from '@protontech/drive-sdk';
import { ProtonDrivePhotosClient } from '@protontech/drive-sdk/protonDrivePhotosClient';

import { type ActionArgs, type Command, Options, printObject } from '../../cli';

export class CommandSharingRemove implements Command {
    group = 'sharing';
    name = 'remove';
    help = 'Removes user access or pending invitations by email.';
    args = ['path'];
    options: Options = {
        email: {
            type: 'string',
            short: 'e',
            multiple: true,
            default: [],
            help: 'Email addresses of the users to remove.',
        },
        everyone: {
            type: 'boolean',
            short: 'a',
            default: false,
            help: 'Remove access for everyone.',
        },
    };

    async action({ paths, args: [pathString], options: { email: emails, everyone, json } }: ActionArgs) {
        const nodePath = paths.getPath(pathString);
        const node = await nodePath.getNode();

        const users = everyone ? await this.getAllMembers(nodePath.sdk, node) : emails;
        const sharingInfo = await nodePath.sdk.unshareNode(node, {
            users,
        });

        printObject(sharingInfo, json);
    }

    private async getAllMembers(sdk: ProtonDriveClient | ProtonDrivePhotosClient, node: NodeEntity): Promise<string[]> {
        const sharingInfo = await sdk.getSharingInfo(node);

        return [
            ...(sharingInfo?.members.map((member) => member.inviteeEmail) || []),
            ...(sharingInfo?.protonInvitations.map((invitation) => invitation.inviteeEmail) || []),
            ...(sharingInfo?.nonProtonInvitations.map((invitation) => invitation.inviteeEmail) || []),
        ];
    }
}
