import { Command, ActionArgs } from '../interface';
import { printObject } from '../formatters';
import { PathType } from '../paths';

export class CommandDiagnosticGetTreeStructure implements Command {
    group = 'diagnostic';
    name = 'get-tree-structure';
    args = ['path'];

    async action({ sdkDiagnostic, paths, args: [pathString], options: { json } }: ActionArgs) {
        const nodePath = paths.getPath(pathString);

        if ([PathType.MyFiles, PathType.Devices, PathType.SharedWithMe].includes(nodePath.type)) {
            const node = await nodePath.getNode();
            const structure = await sdkDiagnostic.getNodeTreeStructure(node);
            printObject(structure, json);
        } else if ([PathType.Photos].includes(nodePath.type)) {
            const structure = await sdkDiagnostic.getPhotosTimelineStructure();
            printObject(structure, json);
        } else {
            throw new Error(`Not supported path type: ${nodePath.type}`);
        }
    }
}
