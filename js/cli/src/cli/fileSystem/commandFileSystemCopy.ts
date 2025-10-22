import { printIterable } from '../formatters';
import { Command, ActionArgs } from '../interface';
import { PathType } from '../paths';

export class CommandFileSystemCopy implements Command {
    group = 'filesystem';
    name = 'copy';
    // FIXME: support copy of multiple files
    args = ['sourcePath', 'targetPath'];

    async action({ sdk, paths, args: [sourcePathString, targetPathString], options: { json } }: ActionArgs) {
        const sourcePath = paths.getPath(sourcePathString);
        const sourceNode = await sourcePath.getNode();

        const targetPath = paths.getPath(targetPathString);
        const targetNode = await targetPath.getNode();

        if (sourcePath.type === PathType.Photos || targetPath.type === PathType.Photos) {
            throw new Error('Copying photos is not supported');
        }

        await printIterable(sdk.copyNodes([sourceNode], targetNode), json, (result) =>
            console.log(result.ok ? `✅ ${result.uid}` : `❌ ${result.uid}: ${result.error}`),
        );
    }
}
