/**
 * Name of the manifest written into every folder takeout creates. It is
 * reserved in every {@link NameRegistry} so no exported node can take it.
 */
export const MANIFEST_FILE_NAME = 'manifest.json';

/**
 * Extension appended to a file name to get the name of the manifest describing
 * that one file, so `notes.txt` is described by `notes.txt.manifest.json`.
 */
export const NODE_FILE_MANIFEST_SUFFIX = '.manifest.json';

/**
 * Recorded in a manifest when takeout left an item that was already on disk
 * from a previous run.
 */
export const ALREADY_EXISTS_MESSAGE = 'This item was already in the folder and was not exported again.';
