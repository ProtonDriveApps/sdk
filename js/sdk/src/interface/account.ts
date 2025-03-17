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
    primaryKeyIndex: number,
    keys: {
        id: string,
        key: PrivateKey,
    }[],
}
