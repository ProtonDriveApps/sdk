import { printObject } from '../formatters';
import { Command, ActionArgs } from '../interface';

export class CommandPhotoRoot implements Command {
    group = 'photo';
    name = 'root';

    async action({ photosSdk, options: { json } }: ActionArgs) {
        const root = await photosSdk.getMyPhotosRootFolder();
        printObject(root, json);
    }
}
