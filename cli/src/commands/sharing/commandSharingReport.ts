import { AbuseCategory, ValidationError } from '@protontech/drive-sdk';

import { type ActionArgs, type Command, Options } from '../../cli';

export class CommandSharingReport implements Command {
    group = 'sharing';
    name = 'report';
    help = 'Reports a shared node for abuse.';
    args = ['path'];
    options: Options = {
        category: {
            type: 'string',
            short: 'c',
            allowedValues: Object.values(AbuseCategory),
            help: 'Abuse category being reported.',
        },
        message: {
            type: 'string',
            short: 'm',
            default: '',
            help: 'Message about the report. Required for copyright and stolen-data categories.',
        },
        email: {
            type: 'string',
            short: 'e',
            default: '',
            help: 'Reporter email. Optional; for authenticated reports the session email is used by default.',
        },
        'bona-fide': {
            type: 'boolean',
            default: false,
            help: 'Confirms the report is submitted in good faith (required legal acknowledgment).',
        },
        revision: {
            type: 'string',
            short: 'r',
            default: '',
            help: 'UID of a specific revision to report. Defaults to the active revision.',
        },
    };

    async action({
        paths,
        args: [pathString],
        options: { category, message, email, 'bona-fide': bonaFide, revision, json },
    }: ActionArgs) {
        if (!Object.values(AbuseCategory).includes(category)) {
            throw new ValidationError(
                `Invalid category: ${category}, must be one of: ${Object.values(AbuseCategory).join(', ')}`,
            );
        }
        if (!bonaFide) {
            throw new ValidationError(
                'You must pass --bona-fide to confirm the report is submitted in good faith (legal acknowledgment).',
            );
        }

        const nodePath = paths.getPath(pathString);
        const node = await nodePath.getNode();

        await nodePath.sdk.reportAbuse({
            nodeUid: node.uid,
            abuseCategory: category,
            bonaFide: true,
            reporterMessage: message || undefined,
            reporterEmail: email || undefined,
            revisionUid: revision || undefined,
        });

        if (!json) {
            console.log(`✅ Report submitted`);
        }
    }
}
