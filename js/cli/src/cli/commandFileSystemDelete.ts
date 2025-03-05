import { Command, ActionArgs } from "./interface";

export class CommandFileSystemDelete implements Command {
    group = "filesystem";
    name = "delete";
    // TODO: support delete of multiple files
    args = ["path"];

    async action({ sdk, paths, args: [pathString] }: ActionArgs) {
        const nodePath = paths.getPath(pathString);
        const node = await nodePath.getNode();
        for await (const result of sdk.deleteNodes([node])) {
            if (!result.ok) {
                throw new Error(result.error);
            }
        }
    }
}
