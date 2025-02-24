import { Command, ActionArgs } from './interface';

export class CommandMkdir implements Command {
    name = 'mkdir';
    args = ['path'];

    async action({ sdk, paths, args: [ pathString ] }: ActionArgs) {
        const path = paths.getPath(pathString);
        const parentPath = path.parentPath;
        const folderName = path.name;

        const parent = await parentPath.getNode();

        await sdk.createFolder(parent, folderName);
    }
}
