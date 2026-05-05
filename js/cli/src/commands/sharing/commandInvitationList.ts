import { ProtonDriveClient, ProtonInvitationWithNode } from '@protontech/drive-sdk';
import { ProtonDrivePhotosClient } from '@protontech/drive-sdk/protonDrivePhotosClient';

import {
    type ActionArgs,
    type Command,
    formatAuthor,
    formatDate,
    formatMemberRole,
    printIterable,
    sanitizeTerminalText,
} from '../../cli';
import { getInvitationUid } from './invitations';

export class CommandInvitationList implements Command {
    group = 'invitation';
    name = 'list';

    async action({ sdk, photosSdk, options: { json } }: ActionArgs) {
        await this.printInvitations(sdk, 'drive', json);
        await this.printInvitations(photosSdk, 'photos', json);
    }

    private async printInvitations(
        sdk: ProtonDriveClient | ProtonDrivePhotosClient,
        context: 'drive' | 'photos',
        json: boolean,
    ): Promise<void> {
        await printIterable(
            sdk.iterateInvitations(),
            json,
            (invitation) => this.printInvitationHuman(invitation, getInvitationUid(context, invitation.uid)),
            (invitation) => ({
                ...invitation,
                uid: getInvitationUid(context, invitation.uid),
            }),
        );
    }

    private printInvitationHuman(invitation: ProtonInvitationWithNode, uid: string): void {
        const type = invitation.node.type === 'file' ? '📄' : '🗂️';
        const permissionFlag = formatMemberRole(invitation.role);
        const author = formatAuthor(invitation.addedByEmail);
        const created = formatDate(invitation.invitationTime, true);
        const name = invitation.node.name.ok ? invitation.node.name.value : invitation.node.name.error.name;
        console.log(sanitizeTerminalText(`${type}${permissionFlag} ${author} ${created} ${name} "${uid}"`));
    }
}
