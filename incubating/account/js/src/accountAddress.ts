import { PrivateKeyReference } from '@protontech/crypto';

export type AccountAddress = {
    email: string;
    addressId: string;
    primaryKeyIndex: number;
    keys: {
        id: string;
        key: PrivateKeyReference;
    }[];
};
