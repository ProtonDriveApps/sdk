import { type ActionArgs, type Command, PathType, printObject } from '../../cli';

export class CommandFileSystemCreateFolder implements Command {
    group = 'filesystem';
    name = 'create-folder';
    args = ['parentPath', 'name'];

    async action({ sdk, paths, args: [pathString, name], options: { json } }: ActionArgs) {
        const parent = await paths.getNode(pathString, [PathType.MyFiles, PathType.Devices, PathType.SharedWithMe]);

        const createdFolder = await sdk.createFolder(parent, name);

        printObject(createdFolder, json);
    }
}
