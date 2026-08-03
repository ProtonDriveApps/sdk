import { InitConfig } from '../config';
import { printVersions } from './version';

const DOWNLOAD_PAGE_URL = 'https://proton.me/download/drive/cli/index.html';

function initOptions(overrides: Partial<InitConfig> = {}): InitConfig {
    return {
        appVersion: 'cli-drive@1.0.0',
        sdkVersion: '2.0.0',
        clientUidPrefix: 'test',
        ...overrides,
    };
}

function mockFetchJson(body: unknown, ok = true): jest.Mock {
    return jest.fn().mockResolvedValue({
        ok,
        json: async () => body,
    });
}

describe('printVersions', () => {
    let logSpy: jest.SpyInstance;
    let fetchMock: jest.Mock;

    beforeEach(() => {
        logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        fetchMock = mockFetchJson({ Releases: [{ Version: '1.0.0' }] });
        // @ts-expect-error - ok for mocking
        global.fetch = fetchMock;
    });

    afterEach(() => {
        logSpy.mockRestore();
        jest.restoreAllMocks();
    });

    function expectOnlyVersions(cliVersion: string) {
        expect(logSpy).toHaveBeenCalledTimes(2);
        expect(logSpy).toHaveBeenCalledWith(`Proton Drive CLI cli-drive@${cliVersion}`);
        expect(logSpy).toHaveBeenCalledWith('Proton Drive SDK 2.0.0');
    }

    function expectNoUpgrade(cliVersion: string) {
        expect(logSpy).toHaveBeenCalledTimes(3);
        expect(logSpy).toHaveBeenCalledWith(`Proton Drive CLI cli-drive@${cliVersion}`);
        expect(logSpy).toHaveBeenCalledWith('Proton Drive SDK 2.0.0');
        expect(logSpy).toHaveBeenCalledWith('You are running the latest version.');
    }

    function expectUpgrade(cliVersion: string, newVersion: string) {
        expect(logSpy).toHaveBeenCalledTimes(4);
        expect(logSpy).toHaveBeenCalledWith(`Proton Drive CLI cli-drive@${cliVersion}`);
        expect(logSpy).toHaveBeenCalledWith('Proton Drive SDK 2.0.0');
        expect(logSpy).toHaveBeenCalledWith(`A newer version is available: ${newVersion} (you have ${cliVersion}).`);
        expect(logSpy).toHaveBeenCalledWith(`Download at ${DOWNLOAD_PAGE_URL}`);
    }

    it('prints CLI and SDK versions', async () => {
        await printVersions(initOptions({ appVersion: 'cli-drive@1.2.3' }));

        expectNoUpgrade('1.2.3');
    });

    it('skips update message when fetch fails', async () => {
        fetchMock.mockRejectedValue(new Error('network error'));

        await printVersions(initOptions());

        expectOnlyVersions('1.0.0');
    });

    it('skips update message when fetch returns a non-ok response', async () => {
        fetchMock.mockResolvedValue({ ok: false });

        await printVersions(initOptions());

        expectOnlyVersions('1.0.0');
    });

    it('reports running the latest version when current matches remote', async () => {
        fetchMock.mockImplementation(
            mockFetchJson({
                Releases: [{ Version: '1.0.0' }],
            }),
        );

        await printVersions(initOptions());

        expectNoUpgrade('1.0.0');
    });

    it('reports running the latest version when current is newer than remote', async () => {
        fetchMock.mockImplementation(mockFetchJson({ Releases: [{ Version: '1.0.0' }] }));

        await printVersions(initOptions({ appVersion: 'cli-drive@2.0.0' }));

        expectNoUpgrade('2.0.0');
    });

    it('reports an upgrade when a newer remote version exists', async () => {
        fetchMock.mockImplementation(
            mockFetchJson({
                Releases: [{ Version: '1.0.0' }, { Version: '1.2.0' }, { Version: '1.1.5' }],
            }),
        );

        await printVersions(initOptions({ appVersion: 'cli-drive@1.0.0' }));

        expectUpgrade('1.0.0', '1.2.0');
    });

    it('ignores releases with pre-release tags when picking the latest', async () => {
        fetchMock.mockImplementation(
            mockFetchJson({
                Releases: [{ Version: '1.0.0' }, { Version: '1.0.1-alpha' }],
            }),
        );

        await printVersions(initOptions({ appVersion: 'cli-drive@1.0.0' }));

        expectNoUpgrade('1.0.0');
    });

    it('ignores releases with missing Version fields when picking the latest', async () => {
        fetchMock.mockImplementation(
            mockFetchJson({
                Releases: [{ Version: '' }, {}, { Version: '1.3.0' }, { Version: '1.2.9' }],
            }),
        );

        await printVersions(initOptions({ appVersion: 'cli-drive@1.0.0' }));

        expectUpgrade('1.0.0', '1.3.0');
    });

    it('skips update message when the remote manifest has no releases', async () => {
        fetchMock.mockImplementation(mockFetchJson({ Releases: [] }));

        await printVersions(initOptions());

        expectOnlyVersions('1.0.0');
    });
});
