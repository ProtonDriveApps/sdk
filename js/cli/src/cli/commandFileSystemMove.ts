import { ProtonDriveClient } from '../../../sdk/src';
import { Command, ActionArgs } from './interface';
import { Path, PathType } from './paths';

export class CommandFileSystemMove implements Command {
    group = 'filesystem';
    name = 'move';
    // TODO: support move of multiple files
    args = ['sourcePath', 'targetPath'];

    async action({ sdk, paths, args }: ActionArgs) {
        const [sourcePathString, targetPathString] = args;

        const sourcePath = paths.getPath(sourcePathString);
        const targetPath = paths.getPath(targetPathString);

        if (sourcePath.type === PathType.MyFiles && targetPath.type === PathType.MyFiles) {
            return this.moveNode(sdk, sourcePath, targetPath.parentPath);
        }
        throw new Error(`Move from ${sourcePath.type} to ${targetPath.type} not supported`);
    }

    private async moveNode(sdk: ProtonDriveClient, sourcePath: Path, targetPath: Path) {
        const sourceNode = await sourcePath.getNode();
        const targetNode = await targetPath.getNode();
        for await (const result of sdk.moveNodes([sourceNode], targetNode)) {
            if (!result.ok) {
                throw new Error(result.error);
            }
        }
    }
}
