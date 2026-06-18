import { ProtonInvitationWithNode } from '@protontech/drive-sdk';

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
    help = 'Lists pending invitations from Drive and Photos.';

    async action({ sdk, photosSdk, options: { json } }: ActionArgs) {
        await printIterable(
            this.iterateInvitations({ sdk, photosSdk }),
            json,
            ({ invitation, context }) =>
                this.printInvitationHuman(invitation, getInvitationUid(context, invitation.uid)),
            ({ invitation, context }) => ({
                ...invitation,
                uid: getInvitationUid(context, invitation.uid),
            }),
        );
    }

    private async *iterateInvitations({ sdk, photosSdk }: Pick<ActionArgs, 'sdk' | 'photosSdk'>): AsyncIterable<{
        invitation: ProtonInvitationWithNode;
        context: 'drive' | 'photos';
    }> {
        for await (const invitation of sdk.iterateInvitations()) {
            yield { invitation, context: 'drive' };
        }
        for await (const invitation of photosSdk.iterateInvitations()) {
            yield { invitation, context: 'photos' };
        }
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
