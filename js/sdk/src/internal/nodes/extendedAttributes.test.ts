import { FileExtendedAttributesParsed, FolderExtendedAttributes, parseFileExtendedAttributes, parseFolderExtendedAttributes } from './extendedAttributes';

const emptyExtendedAttributes = {
    claimedSize: undefined,
    claimedModificationTime: undefined,
    claimedDigests: undefined,
    claimedAdditionalMetadata: undefined,
};

describe('extended attrbiutes', () => {
    describe('should parses file attributes', () => {
        const testCases: [string, FileExtendedAttributesParsed][] = [
            ['', {}],
            ['{}', {}],
            ['a', {}],
            [
                '{"Common": {"ModificationTime": "2009-02-13T23:31:30+0000"}}',
                {
                    claimedModificationTime: new Date(1234567890000),
                    claimedSize: undefined,
                    claimedDigests: undefined,
                    claimedAdditionalMetadata: undefined,
                },
            ],
            [
                '{"Common": {"Size": 123}}',
                {
                    claimedModificationTime: undefined,
                    claimedSize: 123,
                    claimedDigests: undefined,
                    claimedAdditionalMetadata: undefined,
                },
            ],
            [
                '{"Common": {"ModificationTime": "2009-02-13T23:31:30+0000", "Size": 123, "BlockSizes": [1, 2, 3]}}',
                {
                    claimedModificationTime: new Date(1234567890000),
                    claimedSize: 123,
                    claimedDigests: undefined,
                    claimedAdditionalMetadata: undefined,
                },
            ],
            [
                '{"Common": {"ModificationTime": "aa", "Size": 123}}',
                {
                    claimedModificationTime: undefined,
                    claimedSize: 123,
                    claimedDigests: undefined,
                    claimedAdditionalMetadata: undefined,
                },
            ],
            [
                '{"Common": {"ModificationTime": "2009-02-13T23:31:30+0000", "Size": "aaa"}}',
                {
                    claimedModificationTime: new Date(1234567890000),
                    claimedSize: undefined,
                    claimedDigests: undefined,
                    claimedAdditionalMetadata: undefined,
                },
            ],
            [
                '{"Common": {"Digests": {}}}',
                {
                    claimedModificationTime: undefined,
                    claimedSize: undefined,
                    claimedDigests: undefined,
                    claimedAdditionalMetadata: undefined,
                },
            ],
            [
                '{"Common": {"Digests": {"SHA1": null}}}',
                {
                    claimedModificationTime: undefined,
                    claimedSize: undefined,
                    claimedDigests: undefined,
                    claimedAdditionalMetadata: undefined,
                },
            ],
            [
                '{"Common": {"Digests": {"SHA1": "abcdef"}}}',
                {
                    claimedModificationTime: undefined,
                    claimedSize: undefined,
                    claimedDigests: {sha1: "abcdef"},
                    claimedAdditionalMetadata: undefined,
                },
            ],
            [
                '{"Common": {}, "Media": {}}',
                {
                    claimedModificationTime: undefined,
                    claimedSize: undefined,
                    claimedDigests: undefined,
                    claimedAdditionalMetadata: {
                        Media: {},
                    },
                },
            ],
        ];
        testCases.forEach(([input, expectedAttributes]) => {
            it(`should parse ${input}`, () => {
                const output = parseFileExtendedAttributes(input);
                expect(output).toMatchObject(expectedAttributes);
            })
        });
    });
});
