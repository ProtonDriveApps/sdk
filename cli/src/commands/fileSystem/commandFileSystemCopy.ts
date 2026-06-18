import { NodeEntity, ProtonDriveClient, ValidationError } from '@protontech/drive-sdk';

import {
    type ActionArgs,
    type Command,
    findName,
    getName,
    Options,
    PathType,
    printIterable,
    sanitizeTerminalText,
} from '../../cli';

const SUPPORTED_PATH_TYPES = [PathType.MyFiles, PathType.Devices, PathType.SharedWithMe];

export class CommandFileSystemCopy implements Command {
    group = 'filesystem';
    name = 'copy';
    help = 'Copies files and folders. You can copy across My files, devices and shared folders.';
    args = ['sourcePath...', 'targetParentPath'];
    options: Options = {
        name: {
            type: 'string',
            short: 'n',
            default: '',
            help: 'Name of the copied node.',
        },
    };

    async action({ sdk, paths, args, options: { name, json } }: ActionArgs) {
        const sourcePathStrings = args.slice(0, -1);
        const targetPathString = args[args.length - 1];

        if (sourcePathStrings.length > 1 && name !== '') {
            throw new ValidationError('Cannot specify name when copying multiple files');
        }

        const sourceNodes = await paths.getNodes(sourcePathStrings, SUPPORTED_PATH_TYPES);
        const targetNode = await paths.getNode(targetPathString, SUPPORTED_PATH_TYPES);

        if (sourceNodes.length === 1) {
            await this.copyNode(sdk, sourceNodes[0], targetNode, json, name || getName(sourceNodes[0]));
        } else {
            await this.copyNodes(sdk, sourceNodes, targetNode, json);
        }
    }

    private async copyNode(
        sdk: ProtonDriveClient,
        sourceNode: NodeEntity,
        targetNode: NodeEntity,
        json: boolean,
        name: string,
    ) {
        await printIterable(sdk.copyNodes([{ uid: sourceNode.uid, name }], targetNode), json, (result) => {
            console.log(sanitizeTerminalText(result.ok ? `✅ ${name}` : `❌ ${name}: ${result.error.message}`));
        });
    }

    private async copyNodes(sdk: ProtonDriveClient, sourceNodes: NodeEntity[], targetNode: NodeEntity, json: boolean) {
        await printIterable(sdk.copyNodes(sourceNodes, targetNode), json, (result) => {
            const nodeName = findName(sourceNodes, result.uid);
            console.log(sanitizeTerminalText(result.ok ? `✅ ${nodeName}` : `❌ ${nodeName}: ${result.error.message}`));
        });
    }
}
