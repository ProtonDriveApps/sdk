import {
    type CryptoApiInterface,
    PrivateKeyReference,
    PublicKeyReference,
    VERIFICATION_STATUS,
} from '@protontech/crypto';

import type { AccountAddress } from './accountAddress';
import { AccountApi, AddressNotFoundError } from './accountApi';
import type { components as coreComponents } from './api-core-types';
import type { Logger } from './logger';
import type { SessionCredentials } from './sessionCredentials';

interface UserData {
    userPrimaryPrivateKeys: PrivateKeyReference[];
    userPrimaryPublicKeys: PublicKeyReference[];
    primaryAddress: {
        email: string;
        addressId: string;
        addressKeyId: string;
    };
    addresses: coreComponents['schemas']['AddressUser'][];
}

export class Addresses {
    private userDataPromise?: Promise<UserData>;

    private otherUsersPublicKeysByEmailPromises: Map<string, Promise<PublicKeyReference[]>> = new Map();
    private addressKeysByKeyIdPromises: Map<
        string,
        Promise<{ id: string; privateKey: PrivateKeyReference; publicKey: PublicKeyReference }>
    > = new Map();

    constructor(
        private readonly accountApi: AccountApi,
        private readonly credentials: SessionCredentials,
        private readonly cryptoProxy: CryptoApiInterface,
        private readonly logger: Logger,
    ) {
        credentials.on('sessionInfoChanged', () => {
            this.logger.debug(`Session info changed, clearing addresses cache`);
            this.userDataPromise = undefined;
            this.otherUsersPublicKeysByEmailPromises.clear();
            this.addressKeysByKeyIdPromises.clear();
        });
    }

    async getOwnPrimaryAddress(): Promise<AccountAddress> {
        const { primaryAddress } = await this.getUserData();
        return this.getOwnAddress(primaryAddress.addressId);
    }

    async getOwnAddresses(): Promise<AccountAddress[]> {
        const userData = await this.getUserData();

        const addresses: AccountAddress[] = [];
        for (const address of userData.addresses) {
            if (!address.ID) {
                continue;
            }
            const ownAddress = await this.getOwnAddress(address.ID);
            addresses.push(ownAddress);
        }

        return addresses;
    }

    async getOwnAddress(emailOrAddressId: string): Promise<AccountAddress> {
        const userData = await this.getUserData();

        const address = userData.addresses.find((a) => a.ID === emailOrAddressId || a.Email === emailOrAddressId);
        if (!address?.ID || !address?.Email) {
            throw new Error(`Address ${emailOrAddressId} not found`);
        }

        const keys: { id: string; key: PrivateKeyReference }[] = [];
        const errors: unknown[] = [];
        for (const key of address.Keys || []) {
            try {
                const { id, privateKey } = await this.getAddressKey(
                    userData.userPrimaryPrivateKeys,
                    userData.userPrimaryPublicKeys,
                    key,
                    address.Email,
                );
                keys.push({ id, key: privateKey });
            } catch (error: unknown) {
                errors.push(error);
            }
        }

        if (keys.length === 0) {
            throw new Error(`No private key found`, { cause: errors });
        }

        return {
            email: address.Email,
            addressId: address.ID,
            primaryKeyIndex: 0,
            keys: keys,
        };
    }

    async hasProtonAccount(email: string): Promise<boolean> {
        const keys = await this.getPublicKeys(email);
        return keys.length > 0;
    }

    async getPublicKeys(email: string, forceRefresh?: boolean): Promise<PublicKeyReference[]> {
        if (!this.credentials.isLoggedIn()) {
            return [];
        }

        const userData = await this.getUserData();
        const address = userData.addresses.find((a) => a.Email === email);
        if (address) {
            return this.getOwnPublicKeys(address);
        }
        return this.getOtherPublicKeys(email, forceRefresh);
    }

    private async getOwnPublicKeys(address: coreComponents['schemas']['AddressUser']): Promise<PublicKeyReference[]> {
        const { userPrimaryPrivateKeys, userPrimaryPublicKeys } = await this.getUserData();

        const keys: PublicKeyReference[] = [];
        const errors: unknown[] = [];
        for (const key of address.Keys || []) {
            try {
                const { publicKey } = await this.getAddressKey(
                    userPrimaryPrivateKeys,
                    userPrimaryPublicKeys,
                    key,
                    address.Email,
                );
                keys.push(publicKey);
            } catch (error: unknown) {
                errors.push(error);
            }
        }

        if (errors.length > 0) {
            this.logger.error('Errors loading public keys', errors);
        }
        if (keys.length === 0 && errors.length > 0) {
            throw new Error(`Failed to load public keys`, { cause: errors });
        }

        return keys;
    }

    private async getOtherPublicKeys(email: string, forceRefresh?: boolean): Promise<PublicKeyReference[]> {
        if (!forceRefresh && this.otherUsersPublicKeysByEmailPromises.has(email)) {
            return this.otherUsersPublicKeysByEmailPromises.get(email)!;
        }
        const { promise, resolve, reject } = Promise.withResolvers<PublicKeyReference[]>();
        this.otherUsersPublicKeysByEmailPromises.set(email, promise);

        try {
            const response = await this.accountApi.keys(email);

            const publicKeys = await Promise.all(
                (response.Address?.Keys || []).map((key) => {
                    return this.cryptoProxy.importPublicKey({ armoredKey: key.PublicKey });
                }),
            );
            resolve(publicKeys);
        } catch (error) {
            if (error instanceof AddressNotFoundError) {
                resolve([]);
            } else {
                this.logger.error(`Error loading public keys for email ${email}`, error);
                this.otherUsersPublicKeysByEmailPromises.delete(email);
                reject(error);
            }
        }

        return promise;
    }

    private async getUserData(): Promise<UserData> {
        if (this.userDataPromise) {
            return this.userDataPromise;
        }
        const { promise, resolve, reject } = Promise.withResolvers<UserData>();
        this.userDataPromise = promise;

        this.logger.debug(`Loading user data`);

        try {
            const userKeyPassword = this.credentials.getUserKeyPassword();
            if (!userKeyPassword) {
                throw new Error('Password is not set');
            }

            const users = await this.accountApi.users();

            const userKeys = users.User?.Keys;

            const userPrimaryPrivateKeys: PrivateKeyReference[] = [];
            const userPrimaryPublicKeys: PublicKeyReference[] = [];
            for (const userKey of userKeys || []) {
                try {
                    const userPrimaryPrivateKey = await this.cryptoProxy.importPrivateKey({
                        armoredKey: userKey?.PrivateKey,
                        passphrase: userKeyPassword,
                    });

                    const userPrimaryPublicKey = await this.cryptoProxy.importPublicKey({
                        binaryKey: await this.cryptoProxy.exportPublicKey({
                            key: userPrimaryPrivateKey,
                            format: 'binary',
                        }),
                    });

                    userPrimaryPrivateKeys.push(userPrimaryPrivateKey);
                    userPrimaryPublicKeys.push(userPrimaryPublicKey);
                } catch (error) {
                    this.logger.error(`Error importing user key: ${JSON.stringify(userKey)}`, error);
                }
            }

            const addresses = await this.accountApi.addresses();
            const primaryAddress = addresses.Addresses?.at(0);
            const primaryAddressPrimaryKey = primaryAddress?.Keys?.at(0);

            if (!primaryAddress?.Email || !primaryAddress?.ID || !primaryAddressPrimaryKey?.ID) {
                throw new Error('Missing primary address');
            }

            if (!userPrimaryPrivateKeys.length || !userPrimaryPublicKeys.length) {
                throw new Error('Missing user primary keys');
            }

            resolve({
                userPrimaryPrivateKeys,
                userPrimaryPublicKeys,
                primaryAddress: {
                    email: primaryAddress?.Email,
                    addressId: primaryAddress?.ID,
                    addressKeyId: primaryAddressPrimaryKey?.ID,
                },
                addresses: addresses.Addresses || [],
            });
        } catch (error: unknown) {
            this.logger.error(`Error loading user data`, error);
            this.userDataPromise = undefined;
            reject(error);
        }

        return promise;
    }

    private async getAddressKey(
        userPrimaryPrivateKeys: PrivateKeyReference[],
        userPrimaryPublicKeys: PublicKeyReference[],
        key: coreComponents['schemas']['AddressKey'],
        email?: string,
    ) {
        const keyId = key.ID;
        if (!keyId) {
            throw new Error('Missing key ID');
        }

        if (this.addressKeysByKeyIdPromises.has(keyId)) {
            return this.addressKeysByKeyIdPromises.get(keyId)!;
        }
        const { promise, resolve, reject } = Promise.withResolvers<{
            id: string;
            privateKey: PrivateKeyReference;
            publicKey: PublicKeyReference;
        }>();
        this.addressKeysByKeyIdPromises.set(keyId, promise);

        this.logger.debug(`Loading address key ${keyId} for email ${email}`);

        try {
            if (!key?.Token && key?.PrivateKey) {
                const userKeyPassword = this.credentials.getUserKeyPassword();
                if (!userKeyPassword) {
                    throw new Error('User key password is not set');
                }

                const privateKey = await this.cryptoProxy.importPrivateKey({
                    armoredKey: key?.PrivateKey,
                    passphrase: userKeyPassword,
                });

                resolve({
                    id: keyId,
                    privateKey,
                    publicKey: await this.cryptoProxy.importPublicKey({
                        binaryKey: await this.cryptoProxy.exportPublicKey({ key: privateKey, format: 'binary' }),
                    }),
                });
                return promise;
            }

            const { data: decryptedToken, verificationStatus } = await this.cryptoProxy.decryptMessage({
                armoredMessage: key?.Token || '',
                armoredSignature: key?.Signature || '',
                decryptionKeys: userPrimaryPrivateKeys,
                verificationKeys: userPrimaryPublicKeys,
            });

            if (verificationStatus !== VERIFICATION_STATUS.SIGNED_AND_VALID) {
                throw new Error('Failed to verify address key');
            }

            const privateKey = await this.cryptoProxy.importPrivateKey({
                armoredKey: key?.PrivateKey || '',
                passphrase: decryptedToken.toString(),
            });
            const publicKey = await this.cryptoProxy.importPublicKey({
                binaryKey: await this.cryptoProxy.exportPublicKey({ key: privateKey, format: 'binary' }),
            });

            resolve({
                id: keyId,
                privateKey,
                publicKey,
            });
        } catch (error) {
            this.logger.error(`Error loading address key ${keyId} for email ${email}`, error);
            this.addressKeysByKeyIdPromises.delete(keyId);
            reject(error);
        }

        return promise;
    }
}
