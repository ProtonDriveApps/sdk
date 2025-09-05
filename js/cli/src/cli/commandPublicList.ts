
import { ParseArgsConfig } from 'util';
import { Command, ActionArgs } from './interface';

export class CommandPublicList implements Command {
    group = 'public';
    name = 'list';
    args = ['path'];
    options: ParseArgsConfig['options'] = {
        url: {
            type: 'string',
            short: 'u',
        },
        customPassword: {
            type: 'string',
            short: 'c',
            default: '',
        },
    };

    // TODO: json output
    async action({ sdk, options: { url, customPassword } }: ActionArgs) {
        const { isCustomPasswordProtected } = await sdk.experimental.getPublicLinkInfo(url);

        if (isCustomPasswordProtected && !customPassword) {
            throw new Error('Custom password is required');
        }

        const client = await sdk.experimental.authPublicLink(url, customPassword);

        const root = await client.getRootNode();
        console.log(root);

        for await (const node of client.iterateChildren(root.uid)) {
            console.log(node);
        }
    }
}
