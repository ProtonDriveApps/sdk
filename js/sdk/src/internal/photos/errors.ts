import { c } from 'ttag';

export class MissingRelatedPhotosError extends Error {
    constructor(public missingNodeUids: string[]) {
        // We do not want to leak the technical details of the error to the user.
        // When this error happens, it is retried by the SDK, so very likely the
        // user will not see this error unless the operation fails twice in a row.
        super(c('Error').t`Operation failed, try again later`);
        this.name = 'MissingRelatedPhotosError';
    }
}
