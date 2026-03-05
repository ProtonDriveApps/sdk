import { FeatureFlagProvider, FeatureFlags, UploadMetadata } from '../../interface';
import { getMockTelemetry } from '../../tests/telemetry';
import { FileRevisionUploader, FileUploader } from './fileUploader';
import { initUploadModule } from './index';
import { SmallFileRevisionUploader, SmallFileUploader } from './smallFileUploader';

const SMALL_FILE_SIZE_LIMIT = 128 * 1024; // 128 KiB, must match index.ts

describe('initUploadModule - uploader selection', () => {
    const parentFolderUid = 'parent-folder-uid';
    const name = 'test-file.txt';
    const nodeUid = 'node-uid';

    let featureFlagProvider: jest.Mocked<FeatureFlagProvider>;
    let uploadModule: ReturnType<typeof initUploadModule>;

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
    });

    describe('getFileUploader', () => {
        it('returns SmallFileUploader when feature flag is enabled and file size is below limit', async () => {
            featureFlagProvider.isEnabled.mockResolvedValue(true);

            const metadata: UploadMetadata = { expectedSize: 1, mediaType: 'text/plain' };
            const uploader = await uploadModule.getFileUploader(parentFolderUid, name, metadata);

            expect(uploader).toBeInstanceOf(SmallFileUploader);
        });

        it('returns FileUploader when feature flag is enabled but file size exceeds limit', async () => {
            featureFlagProvider.isEnabled.mockResolvedValue(true);

            const metadata: UploadMetadata = {
                expectedSize: SMALL_FILE_SIZE_LIMIT,
                mediaType: 'text/plain',
            };
            const uploader = await uploadModule.getFileUploader(parentFolderUid, name, metadata);

            expect(uploader).toBeInstanceOf(FileUploader);
        });

        it('returns FileUploader when feature flag is disabled even for small file', async () => {
            featureFlagProvider.isEnabled.mockResolvedValue(false);

            const metadata: UploadMetadata = { expectedSize: 1, mediaType: 'text/plain' };
            const uploader = await uploadModule.getFileUploader(parentFolderUid, name, metadata);

            expect(uploader).toBeInstanceOf(FileUploader);
        });
    });

    describe('getFileRevisionUploader', () => {
        it('returns SmallFileRevisionUploader when feature flag is enabled and file size is below limit', async () => {
            featureFlagProvider.isEnabled.mockResolvedValue(true);

            const metadata: UploadMetadata = { expectedSize: 1, mediaType: 'text/plain' };
            const uploader = await uploadModule.getFileRevisionUploader(nodeUid, metadata);

            expect(uploader).toBeInstanceOf(SmallFileRevisionUploader);
        });

        it('returns FileRevisionUploader when feature flag is enabled but file size exceeds limit', async () => {
            featureFlagProvider.isEnabled.mockResolvedValue(true);

            const metadata: UploadMetadata = {
                expectedSize: SMALL_FILE_SIZE_LIMIT + 1,
                mediaType: 'text/plain',
            };
            const uploader = await uploadModule.getFileRevisionUploader(nodeUid, metadata);

            expect(uploader).toBeInstanceOf(FileRevisionUploader);
        });

        it('returns FileRevisionUploader when feature flag is disabled even for small file', async () => {
            featureFlagProvider.isEnabled.mockResolvedValue(false);

            const metadata: UploadMetadata = { expectedSize: 1, mediaType: 'text/plain' };
            const uploader = await uploadModule.getFileRevisionUploader(nodeUid, metadata);

            expect(uploader).toBeInstanceOf(FileRevisionUploader);
        });
    });
});
