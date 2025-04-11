import { arrayToHexString } from "./driveCrypto";

describe("arrayToHexString", () => {
    it("should convert a Uint8Array to a hex string", () => {
        const input = new Uint8Array([0, 255, 16, 32]);
        const expectedOutput = "00ff1020";
        const result = arrayToHexString(input);
        expect(result).toBe(expectedOutput);
    });

    it("should handle an empty Uint8Array", () => {
        const input = new Uint8Array([]);
        const expectedOutput = "";
        const result = arrayToHexString(input);
        expect(result).toBe(expectedOutput);
    });

    it("should handle a Uint8Array with one element", () => {
        const input = new Uint8Array([1]);
        const expectedOutput = "01";
        const result = arrayToHexString(input);
        expect(result).toBe(expectedOutput);
    });
});
