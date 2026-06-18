import { FeatureFlagProvider, ThumbnailType, UploadMetadata } from '../../interface';
import { getMockTelemetry } from '../../tests/telemetry';
import { FileRevisionUploader, FileUploader, Uploader } from './fileUploader';
import { initUploadModule } from './index';

const RAW_SMALL_FILE_SIZE_LIMIT = (128 * 1024) / 1.1; // 128 KiB, must match index.ts

describe('initUploadModule', () => {
    const parentFolderUid = 'parent-folder-uid';
    const name = 'test-file.txt';
    const nodeUid = 'node-uid';

    let featureFlagProvider: jest.Mocked<FeatureFlagProvider>;
    let uploadModule: ReturnType<typeof initUploadModule>;
    let initSmallFileSpy: jest.SpyInstance;
    let initSmallRevisionSpy: jest.SpyInstance;
    let initStreamSpy: jest.SpyInstance;

    let stream: ReadableStream;
    const thumbnail100k = { type: ThumbnailType.Type1, thumbnail: new Uint8Array(100_000) };

    beforeEach(() => {
        const apiService = {};
        const driveCrypto = {};
        const sharesService = {};
        const nodesService = {};
        featureFlagProvider = {
            isEnabled: jest.fn().mockResolvedValue(true),
        };

        uploadModule = initUploadModule(
            getMockTelemetry(),
            apiService as any,
            driveCrypto as any,
            sharesService as any,
            nodesService as any,
            featureFlagProvider as any,
        );

        initSmallFileSpy = jest.spyOn(FileUploader.prototype as any, 'initSmallFileUploader').mockResolvedValue({
            nodeRevisionUid: 'revision-uid',
            nodeUid: 'node-uid',
        });
        initSmallRevisionSpy = jest
            .spyOn(FileRevisionUploader.prototype as any, 'initSmallFileUploader')
            .mockResolvedValue({
                nodeRevisionUid: 'revision-uid',
                nodeUid: 'node-uid',
            });
        initStreamSpy = jest.spyOn(Uploader.prototype as any, 'initStreamUploader').mockResolvedValue({
            start: jest.fn().mockResolvedValue({
                nodeRevisionUid: 'revision-uid',
                nodeUid: 'node-uid',
            }),
        } as any);

        stream = new ReadableStream({
            start(controller) {
                controller.close();
            },
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    async function drainUpload(controller: { completion(): Promise<unknown> }) {
        await controller.completion();
    }

    const suites = [
        {
            method: 'getFileUploader',
            getUploader: (metadata: UploadMetadata) => uploadModule.getFileUploader(parentFolderUid, name, metadata),
            expect: (option: 'small' | 'stream') => {
                if (option === 'stream') {
                    expect(initStreamSpy).toHaveBeenCalled();
                    expect(initSmallFileSpy).not.toHaveBeenCalled();
                    expect(initSmallRevisionSpy).not.toHaveBeenCalled();
                } else {
                    expect(initSmallFileSpy).toHaveBeenCalled();
                    expect(initStreamSpy).not.toHaveBeenCalled();
                    expect(initSmallRevisionSpy).not.toHaveBeenCalled();
                }
            },
        },
        {
            method: 'getFileRevisionUploader',
            getUploader: (metadata: UploadMetadata) => uploadModule.getFileRevisionUploader(nodeUid, metadata),
            expect: (option: 'small' | 'stream') => {
                if (option === 'stream') {
                    expect(initStreamSpy).toHaveBeenCalled();
                    expect(initSmallFileSpy).not.toHaveBeenCalled();
                    expect(initSmallRevisionSpy).not.toHaveBeenCalled();
                } else {
                    expect(initSmallRevisionSpy).toHaveBeenCalled();
                    expect(initSmallFileSpy).not.toHaveBeenCalled();
                    expect(initStreamSpy).not.toHaveBeenCalled();
                }
            },
        },
    ];
    for (const suite of suites) {
        describe(suite.method, () => {
            it('uses stream path when feature flag is disabled even for small file', async () => {
                featureFlagProvider.isEnabled.mockResolvedValue(false);

                const metadata: UploadMetadata = { expectedSize: 1, mediaType: 'text/plain' };
                const uploader = await suite.getUploader(metadata);
                await drainUpload(await uploader.uploadFromStream(stream, []));

                suite.expect('stream');
            });

            it('uses small-file path when flag is on and encrypted total size is below cap', async () => {
                featureFlagProvider.isEnabled.mockResolvedValue(true);

                const metadata: UploadMetadata = { expectedSize: 100, mediaType: 'text/plain' };
                const uploader = await suite.getUploader(metadata);
                await drainUpload(await uploader.uploadFromStream(stream, []));

                suite.expect('small');
            });

            it('uses small-file path when flag is on and encrypted total size with thumbnails is below cap', async () => {
                featureFlagProvider.isEnabled.mockResolvedValue(true);

                const metadata: UploadMetadata = { expectedSize: 100, mediaType: 'image/jpeg' };
                const uploader = await suite.getUploader(metadata);
                await drainUpload(await uploader.uploadFromStream(stream, [thumbnail100k]));

                suite.expect('small');
            });

            it('uses stream path when feature flag is enabled but raw file size exceeds limit', async () => {
                featureFlagProvider.isEnabled.mockResolvedValue(true);

                const metadata: UploadMetadata = { expectedSize: RAW_SMALL_FILE_SIZE_LIMIT, mediaType: 'text/plain' };
                const uploader = await suite.getUploader(metadata);
                await drainUpload(await uploader.uploadFromStream(stream, []));

                suite.expect('stream');
            });

            it('uses stream path when thumbnail bytes push encrypted total size with thumbnail exceeds limit', async () => {
                featureFlagProvider.isEnabled.mockResolvedValue(true);

                const metadata: UploadMetadata = { expectedSize: 100_000, mediaType: 'image/jpeg' };
                const uploader = await suite.getUploader(metadata);
                await drainUpload(await uploader.uploadFromStream(stream, [thumbnail100k]));

                suite.expect('stream');
            });
        });
    }
});
