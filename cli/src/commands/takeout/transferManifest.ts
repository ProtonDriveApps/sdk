import { Device, InvalidNameError, NodeEntity } from '@protontech/drive-sdk';

import { formatTransferErrorMessage } from '../fileSystem/transferSummary';

/**
 * Generic manifest part that collects what items a section exported, what it
 * skipped, and what errors it encountered. This is then embedded in the
 * higher-level manifest.
 */
export type TransferManifest = {
    items: TransferManifestItem[];
    skippedItems: TransferManifestSkippedItem[];
    errors: TransferManifestError[];
};

export type TransferManifestItem = SerializedName & {
    /** Path relative to the section root, always with POSIX separators. */
    path: string;
    uid: string;
};

export type TransferManifestSkippedItem = TransferManifestItem & {
    reason: string;
};

export type TransferManifestError = {
    /** Path relative to the section root, always with POSIX separators. Absent for section-level errors. */
    path?: string;
    /** UID of the item that caused the error. Absent for section-level errors. */
    uid?: string;
    error: string;
};

export type SerializedName = {
    originalName: string | null;
    error?: string;
};

export class TransferManifestBuilder {
    private readonly items: TransferManifestItem[] = [];
    private readonly skippedItems: TransferManifestSkippedItem[] = [];
    private readonly errors: TransferManifestError[] = [];

    addItem(item: TransferManifestItem): void {
        this.items.push(item);
    }

    addSkippedItem(item: TransferManifestItem, reason: string): void {
        this.skippedItems.push({ ...item, reason });
    }

    addError(error: unknown, node?: { path?: string; uid?: string }): void {
        this.errors.push({ ...node, error: formatTransferErrorMessage(error) });
    }

    get hasErrors(): boolean {
        return this.errors.length > 0;
    }

    build(): TransferManifest {
        return {
            items: this.items,
            skippedItems: this.skippedItems,
            errors: this.errors,
        };
    }
}

export function serializeNodeName(node: NodeEntity): SerializedName {
    return serializeName(node.name);
}

export function serializeName(name: NodeEntity['name'] | Device['name']): SerializedName {
    if (name.ok) {
        return { originalName: name.value };
    }
    return { originalName: null, error: formatNameError(name.error) };
}

function formatNameError(error: Error | InvalidNameError): string {
    return error instanceof Error ? `${error.name}: ${error.message}` : error.error;
}
