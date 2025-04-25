import { ParseArgsConfig } from "util";
import { ProtonDriveClient } from '../../../sdk/src';
import { Command, ActionArgs } from './interface';
import { Path, PathType } from './paths';

export class CommandFileSystemMove implements Command {
    group = 'filesystem';
    name = 'move';
    // FIXME: support move of multiple files
    args = ['sourcePath', 'targetPath'];
    options: ParseArgsConfig['options'] = {
        json: {
            type: 'boolean',
            short: 'j',
            default: false,
        },
    };

    async action({ sdk, paths, args, options: { json } }: ActionArgs) {
        const [sourcePathString, targetPathString] = args;

        const sourcePath = paths.getPath(sourcePathString);
        const targetPath = paths.getPath(targetPathString);

        if (sourcePath.type === PathType.MyFiles && targetPath.type === PathType.MyFiles) {
            return this.moveNode(sdk, sourcePath, targetPath, json);
        }
        throw new Error(`Move from ${sourcePath.type} to ${targetPath.type} not supported`);
    }

    private async moveNode(sdk: ProtonDriveClient, sourcePath: Path, targetPath: Path, json: boolean) {
        const sourceNode = await sourcePath.getNode();
        const targetNode = await targetPath.getNode();
        for await (const result of sdk.moveNodes([sourceNode], targetNode)) {
            if (json) {
                console.log(JSON.stringify(result));
            } else {
                console.log(result.ok ? `✅ ${result.uid}` : `❌ ${result.uid}: ${result.error}`);
            }
        }
    }
}
