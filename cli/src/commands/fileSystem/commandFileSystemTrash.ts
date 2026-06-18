import { type ActionArgs, type Command, findName, PathType, printIterable, sanitizeTerminalText } from '../../cli';

const SUPPORTED_PATH_TYPES = [PathType.MyFiles, PathType.Devices, PathType.Photos];

export class CommandFileSystemTrash implements Command {
    group = 'filesystem';
    name = 'trash';
    help = 'Moves items to trash. Does not permanently delete; use delete or empty-trash for that.';
    args = ['path...'];

    async action({ paths, args: pathStrings, options: { json } }: ActionArgs) {
        const nodePaths = paths.getPaths(pathStrings, SUPPORTED_PATH_TYPES);
        const nodes = await paths.getNodes(pathStrings, SUPPORTED_PATH_TYPES);

        await printIterable(nodePaths[0].sdk.trashNodes(nodes), json, (result) => {
            const nodeName = findName(nodes, result.uid);
            console.log(sanitizeTerminalText(result.ok ? `✅ ${nodeName}` : `❌ ${nodeName}: ${result.error.message}`));
        });
    }
}
