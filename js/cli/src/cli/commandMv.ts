import { ProtonDriveClient } from '../../../sdk/src';
import { Command, ActionArgs } from './interface';
import { Path, PathType } from './paths';

export class CommandMv implements Command {
    name = 'mv';
    args = ['sourcePath', 'targetPath'];

    async action({ sdk, paths, args: [ sourcePathString, targetPathString ] }: ActionArgs) {
        const sourcePath = paths.getPath(sourcePathString);
        const targetPath = paths.getPath(targetPathString);

        if (sourcePath.fullPath === targetPath.fullPath) {
            throw new Error('Cannot move to the same path');
        }

        if (targetPath.type === PathType.Trash) {
            return this.trashNode(sdk, sourcePath);
        }

        if (sourcePath.type === PathType.MyFiles && targetPath.type === PathType.MyFiles) {
            if (sourcePath.parentPath.fullPath === targetPath.parentPath.fullPath) {
                return this.renameNode(sdk, sourcePath, targetPath);
            }
            if (sourcePath.name === targetPath.name) {
                return this.moveNode(sdk, sourcePath, targetPath.parentPath);
            }
            throw new Error('Rename with move not supported');
        }

        throw new Error(`Move from ${sourcePath.type} to ${targetPath.type} not supported`);
    }

    private async trashNode(sdk: ProtonDriveClient, sourcePath: Path) {
        const node = await sourcePath.getNode();
        for await (const result of sdk.trashNodes([node])) {
            if (!result.ok) {
                throw new Error(result.error);
            }
        }
    }

    private async renameNode(sdk: ProtonDriveClient, sourcePath: Path, targetPath: Path) {
        const node = await sourcePath.getNode();
        await sdk.renameNode(node, targetPath.name);
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
