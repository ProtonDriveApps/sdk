// This file has copy-pasted utilities from CryptoProxy located in Proton web clients monorepo.

export function uint8ArrayToBase64String(array: Uint8Array) {
    return encodeBase64(arrayToBinaryString(array));
}

export function base64StringToUint8Array(string: string){
    return binaryStringToArray(decodeBase64(string) || '');
}

const ifDefined =
    <T, R>(cb: (input: T) => R) =>
    <U extends T | undefined>(input: U) => {
        return (input !== undefined ? cb(input as T) : undefined) as U extends T ? R : undefined;
    };

const encodeBase64 = ifDefined((input: string) => btoa(input).trim());

const decodeBase64 = ifDefined((input: string) => atob(input.trim()));

const arrayToBinaryString = (bytes: Uint8Array) => {
    const result = [];
    const bs = 1 << 14;
    const j = bytes.length;

    for (let i = 0; i < j; i += bs) {
        // @ts-expect-error Uint8Array treated as number[]
        // eslint-disable-next-line prefer-spread
        result.push(String.fromCharCode.apply(String, bytes.subarray(i, i + bs < j ? i + bs : j)));
    }
    return result.join('');
};

const binaryStringToArray = (str: string) => {
    const result = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
        result[i] = str.charCodeAt(i);
    }
    return result;
};
