import { type ActionArgs, type Command, findName, PathType, printIterable, sanitizeTerminalText } from '../../cli';

const SUPPORTED_PATH_TYPES = [PathType.Trash, PathType.PhotosTrash];

export class CommandFileSystemDelete implements Command {
    group = 'filesystem';
    name = 'delete';
    help =
        'Permanently deletes trashed items only. First trash your files and then use this command to delete them permanently.';
    args = ['path...'];

    async action({ paths, args: pathStrings, options: { json } }: ActionArgs) {
        const nodePaths = paths.getPaths(
            pathStrings,
            SUPPORTED_PATH_TYPES,
            `You can permanently delete items only from trash. Trash your files first.`,
        );
        const nodes = await paths.getNodes(pathStrings, SUPPORTED_PATH_TYPES);

        await printIterable(nodePaths[0].sdk.deleteNodes(nodes), json, (result) => {
            const nodeName = findName(nodes, result.uid);
            console.log(sanitizeTerminalText(result.ok ? `✅ ${nodeName}` : `❌ ${nodeName}: ${result.error.message}`));
        });
    }
}
