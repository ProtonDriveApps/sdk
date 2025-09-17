import { Command, ActionArgs } from './interface';

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

        for await (const result of sdk.copyNodes([sourceNode], targetNode)) {
            if (json) {
                console.log(JSON.stringify(result));
            } else {
                console.log(result.ok ? `✅ ${result.uid}` : `❌ ${result.uid}: ${result.error}`);
            }
        }
    }
}
