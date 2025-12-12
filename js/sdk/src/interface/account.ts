import { PrivateKey, PublicKey } from '../crypto';

export interface ProtonDriveAccount {
    /**
     * Get own primary address.
     *
     * @throws Error If there is no primary address.
     */
    getOwnPrimaryAddress(): Promise<ProtonDriveAccountAddress>;
    /**
     * Get all own addresses.
     *
     * @throws Error If there are no addresses.
     */
    getOwnAddresses(): Promise<ProtonDriveAccountAddress[]>;
    /**
     * Get own address by email or addressId.
     *
     * @throws Error If there is no address with given email or addressId.
     */
    getOwnAddress(emailOrAddressId: string): Promise<ProtonDriveAccountAddress>;
    /**
     * Returns whether given email can be used to share files with Proton Drive.
     */
    hasProtonAccount(email: string): Promise<boolean>;
    /**
     * Get public keys for given email.
     *
     * Does not throw if there is no public key for given email, but returns empty array.
     *
     * @throws Error Only if there is an error while fetching keys.
     */
    getPublicKeys(email: string): Promise<PublicKey[]>;
}

export interface ProtonDriveAccountAddress {
    email: string;
    addressId: string;
    primaryKeyIndex: number;
    keys: {
        id: string;
        key: PrivateKey;
    }[];
}
