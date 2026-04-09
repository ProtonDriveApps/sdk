import { ProtonDriveClient, MaybeNode } from '@protontech/drive-sdk';

import { printIterable, type Command, type ActionArgs, PathType, findName } from '../../cli';

const SUPPORTED_PATH_TYPES = [PathType.MyFiles, PathType.Devices];

export class CommandFileSystemMove implements Command {
    group = 'filesystem';
    name = 'move';
    args = ['sourcePath...', 'targetPath'];

    async action({ sdk, paths, args, options: { json } }: ActionArgs) {
        const sourcePathStrings = args.slice(0, -1);
        const targetPathString = args[args.length - 1];

        const sourceNodes = await paths.getNodes(sourcePathStrings, SUPPORTED_PATH_TYPES);
        const targetNode = await paths.getNode(targetPathString, SUPPORTED_PATH_TYPES);

        await this.moveNodes(sdk, sourceNodes, targetNode, json);
    }

    private async moveNodes(sdk: ProtonDriveClient, sourceNodes: MaybeNode[], targetNode: MaybeNode, json: boolean) {
        await printIterable(sdk.moveNodes(sourceNodes, targetNode), json, (result) => {
            const nodeName = findName(sourceNodes, result.uid);
            console.log(result.ok ? `✅ ${nodeName}` : `❌ ${nodeName}: ${result.error}`);
        });
    }
}
