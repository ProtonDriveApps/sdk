import { ParseArgsConfig } from 'util';

import { MaybeNode, ProtonDriveClient } from '@protontech/drive-sdk';
import { ProtonDrivePhotosClient } from '@protontech/drive-sdk/protonDrivePhotosClient';

import { type ActionArgs, type Command, printObject } from '../../cli';

export class CommandSharingRemove implements Command {
    group = 'sharing';
    name = 'remove';
    args = ['path'];
    options: ParseArgsConfig['options'] = {
        email: {
            type: 'string',
            short: 'e',
            multiple: true,
            default: [],
        },
        everyone: {
            type: 'boolean',
            short: 'a',
            default: false,
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

    private async getAllMembers(sdk: ProtonDriveClient | ProtonDrivePhotosClient, node: MaybeNode): Promise<string[]> {
        const sharingInfo = await sdk.getSharingInfo(node);

        return [
            ...sharingInfo?.members.map((member) => member.inviteeEmail) || [],
            ...sharingInfo?.protonInvitations.map((invitation) => invitation.inviteeEmail) || [],
            ...sharingInfo?.nonProtonInvitations.map((invitation) => invitation.inviteeEmail) || [],
        ]
    }
}
