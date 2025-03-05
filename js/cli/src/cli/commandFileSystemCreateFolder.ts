import { Command, ActionArgs } from './interface';

export class CommandFileSystemCreateFolder implements Command {
    group = 'filesystem';
    name = 'create-folder';
    args = ['path', 'name'];

    async action({ sdk, paths, args: [ pathString, name ] }: ActionArgs) {
        const path = paths.getPath(pathString);
        const parent = await path.getNode();
        await sdk.createFolder(parent, name);
    }
}
