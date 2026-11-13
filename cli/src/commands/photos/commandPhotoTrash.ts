
import { ValidationError } from '@protontech/drive-sdk';

import { type ActionArgs, type Command, Options } from '../../cli';

export class CommandPhotoTrash implements Command {
    group = 'photo';
    name = 'trash';
    help = 'Moves a photo to trash';
    args = ['photoUIDs...'];
    options: Options = {};

    async action({
        logger,
        photosSdk,
        args,
        options: { json },
    }: ActionArgs) {
        const photoNodeUIDs = args;

        if (photoNodeUIDs.length === 0) {
            throw new ValidationError('At least one photo node UID required');
        }

        for await (const result of photosSdk.trashNodes(photoNodeUIDs)) {
            logger.debug(`${result}`);
            if (!json) {
                if (result.ok) {
                    console.log(`✅ Deleted photo ${result.uid}`);
                } else {
                    console.error(`Failed to delete ${result.uid}`);
                }
            }
        }
    }
}