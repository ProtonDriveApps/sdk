import { ProtonDriveAccount, ProtonDriveAccountAddress } from '@protontech/drive-sdk';

import type { Addresses } from 'proton-drive-sdk-account';

export class DriveAccountAdapter implements ProtonDriveAccount {
    constructor(private readonly addresses: Addresses) {}

    getOwnPrimaryAddress(): Promise<ProtonDriveAccountAddress> {
        return this.addresses.getOwnPrimaryAddress();
    }

    getOwnAddresses(): Promise<ProtonDriveAccountAddress[]> {
        return this.addresses.getOwnAddresses();
    }

    getOwnAddress(emailOrAddressId: string): Promise<ProtonDriveAccountAddress> {
        return this.addresses.getOwnAddress(emailOrAddressId);
    }

    hasProtonAccount(email: string): Promise<boolean> {
        return this.addresses.hasProtonAccount(email);
    }

    getPublicKeys(email: string, forceRefresh?: boolean) {
        return this.addresses.getPublicKeys(email, forceRefresh);
    }
}
