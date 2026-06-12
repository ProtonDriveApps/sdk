import { type ActionArgs, type Command, findName, PathType, printIterable, sanitizeTerminalText } from '../../cli';

const SUPPORTED_PATH_TYPES = [PathType.Trash, PathType.PhotosTrash];

export class CommandFileSystemRestore implements Command {
    group = 'filesystem';
    name = 'restore';
    help = 'Restores trashed items.';
    args = ['path...'];

    async action({ paths, args: pathStrings, options: { json } }: ActionArgs) {
        const nodePaths = paths.getPaths(pathStrings, SUPPORTED_PATH_TYPES);
        const nodes = await paths.getNodes(pathStrings, SUPPORTED_PATH_TYPES);

        await printIterable(nodePaths[0].sdk.restoreNodes(nodes), json, (result) => {
            const nodeName = findName(nodes, result.uid);
            console.log(sanitizeTerminalText(result.ok ? `✅ ${nodeName}` : `❌ ${nodeName}: ${result.error.message}`));
        });
    }
}
