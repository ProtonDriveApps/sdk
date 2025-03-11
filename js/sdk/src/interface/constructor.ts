
import { PrivateKey, PublicKey } from '../crypto';

export interface ProtonDriveAccount {
    getOwnPrimaryAddress(): Promise<ProtonDriveAccountAddress>,
    // TODO: do we want to break it down to email vs address ID methods?
    getOwnAddress(emailOrAddressId: string): Promise<ProtonDriveAccountAddress>,
    getPublicKeys(email: string): Promise<PublicKey[]>,
}

export interface ProtonDriveAccountAddress {
    email: string,
    addressId: string,
    primaryKey: {
        id: string,
        key: PrivateKey,
    },
    keys: {
        id: string,
        key: PrivateKey,
    }[],
}

export interface ProtonDriveHTTPClient {
    fetch(request: Request, signal?: AbortSignal): Promise<Response>,
}

export type ProtonDriveConfig = {
    baseUrl?: string,
    language?: string,
    observabilityEnabled?: boolean,
    uploadTimeout?: number,
    uploadQueueLimitItems?: number,
    downloadTimeout?: number,
    downloadQueueLimitItems?: number,
}
