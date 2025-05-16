const PROTON_DOC_MEDIA_TYPE = 'application/vnd.proton.doc';
const PROTON_SHEET_MEDIA_TYPE = 'application/vnd.proton.sheet';

export function isProtonDocument(mediaType?: string) {
    return mediaType === PROTON_DOC_MEDIA_TYPE;
}

export function isProtonSheet(mediaType?: string) {
    return mediaType === PROTON_SHEET_MEDIA_TYPE;
}
