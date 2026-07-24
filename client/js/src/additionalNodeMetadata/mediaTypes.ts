export function getFileExtension(name: string | undefined) {
    return (name || '').split('.').pop();
}

export function isImage(mediaType: string) {
    return mediaType.startsWith('image/');
}

export function isSVG(mediaType: string) {
    return mediaType === MediaTypes.svg;
}

export function isVideo(mediaType: string) {
    return mediaType.startsWith('video/');
}

export function isRAWPhoto(mediaType: string): boolean {
    return Object.values(RAWMimeTypes).some((rawType) => rawType === mediaType);
}

export function isRAWExtension(extension: string | undefined): boolean {
    if (!extension) {
        return false;
    }

    const lowerExt = extension.toLowerCase();
    return Object.keys(RAWMimeTypes).includes(lowerExt);
}

enum MediaTypes {
    aac = 'audio/aac',
    apk = 'application/vnd.android.package-archive',
    apng = 'image/apng',
    arc = 'application/x-freearc',
    avi = 'video/x-msvideo',
    avif = 'image/avif',
    bmp = 'image/bmp',
    bzip2 = 'application/x-bzip2',
    cr3 = 'image/x-canon-cr3',
    docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    eot = 'application/vnd.ms-fontobject',
    epub = 'application/epub+zip',
    flac = 'audio/x-flac',
    flv = 'video/x-flv',
    gif = 'image/gif',
    gzip = 'application/gzip',
    heic = 'image/heic',
    heics = 'image/heic-sequence',
    heif = 'image/heif',
    heifs = 'image/heif-sequence',
    ico = 'image/x-icon',
    jpg = 'image/jpeg',
    jxl = 'image/jxl',
    keynote = 'application/vnd.apple.keynote',
    m4a = 'audio/x-m4a',
    m4v = 'video/x-m4v',
    midi = 'audio/midi',
    mp1s = 'video/MP1S',
    mp2p = 'video/MP2P',
    mp2t = 'video/mp2t',
    mp4a = 'audio/mp4',
    mp4v = 'video/mp4',
    mpeg = 'audio/mpeg',
    mpg = 'video/mpeg',
    numbers = 'application/vnd.apple.numbers',
    odp = 'application/vnd.oasis.opendocument.presentation',
    ods = 'application/vnd.oasis.opendocument.spreadsheet',
    odt = 'application/vnd.oasis.opendocument.text',
    oga = 'audio/ogg',
    ogg = 'application/ogg',
    ogv = 'video/ogg',
    opus = 'audio/opus',
    otf = 'font/otf',
    pages = 'application/vnd.apple.pages',
    pdf = 'application/pdf',
    png = 'image/png',
    pptx = 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    qcp = 'audio/qcelp',
    qt = 'video/quicktime',
    rar = 'application/vnd.rar',
    rtf = 'application/rtf',
    svg = 'image/svg+xml',
    swf = 'application/x-shockwave-flash',
    tar = 'application/x-tar',
    tiff = 'image/tiff',
    ttf = 'font/ttf',
    v3g2 = 'video/3gpp2',
    v3gp = 'video/3gpp',
    wav = 'audio/wav',
    webp = 'image/webp',
    woff = 'font/woff',
    woff2 = 'font/woff2',
    x7zip = 'application/x-7z-compressed',
    xlsx = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xml = 'text/xml',
    zip = 'application/zip',
    vdnMicrosoftIcon = 'image/vnd.microsoft.icon',
}

enum RAWMimeTypes {
    dcraw = 'image/x-dcraw',
    dng = 'image/x-adobe-dng',
    crw = 'image/x-canon-crw',
    cr2 = 'image/x-canon-cr2',
    cr3 = 'image/x-canon-cr3',
    erf = 'image/x-epson-erf',
    raf = 'image/x-fuji-raf',
    dcr = 'image/x-kodak-dcr',
    k25 = 'image/x-kodak-k25',
    kdc = 'image/x-kodak-kdc',
    mrw = 'image/x-minolta-mrw',
    nef = 'image/x-nikon-nef',
    nrw = 'image/x-nikon-nrw',
    orf = 'image/x-olympus-orf',
    raw = 'image/x-panasonic-raw',
    rw2 = 'image/x-panasonic-rw2',
    pef = 'image/x-pentax-pef',
    ptx = 'image/x-pentax-ptx',
    x3f = 'image/x-sigma-x3f',
    srf = 'image/x-sony-srf',
    sr2 = 'image/x-sony-sr2',
    arw = 'image/x-sony-arw',
    iiq = 'image/x-phaseone-iiq',
    mef = 'image/x-mamiya-mef',
    rwl = 'image/x-leica-rwl',
    '3fr' = 'image/x-hasselblad-3fr',
    fff = 'image/x-hasselblad-fff',
}
