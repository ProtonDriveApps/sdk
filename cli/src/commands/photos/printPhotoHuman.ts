import { PhotoNode } from '@protontech/drive-sdk/interface';

import { formatDate, formatSize, getClaimedSize, getName, sanitizeTerminalText } from '../../cli';

export function printPhotoHuman(node: PhotoNode): void {
    const created = formatDate(node.creationTime, true);
    const claimedSize = getClaimedSize(node);
    const size = claimedSize ? formatSize(claimedSize, true) : '-';
    const name = getName(node);
    console.log(sanitizeTerminalText(`${created} ${size} ${name}`));
}
