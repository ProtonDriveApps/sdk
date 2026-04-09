import { printObject, type Command, type ActionArgs, PathType } from '../../cli';

export class CommandFileSystemCreateFolder implements Command {
    group = 'filesystem';
    name = 'create-folder';
    args = ['path', 'name'];

    async action({ sdk, paths, args: [pathString, name], options: { json } }: ActionArgs) {
        const parent = await paths.getNode(pathString, [PathType.MyFiles, PathType.Devices, PathType.SharedWithMe]);

        const createdFolder = await sdk.createFolder(parent, name);

        printObject(createdFolder, json);
    }
}
