import {
    processDriveRequirementHeaders,
    RequirementScope,
} from './apiRequirements';

const TEST_FEATURE_MASK = 1 << 0;
const TEST_FEATURE_MASK_2 = 1 << 1;

function generateHeaders(options?: {
    features?: string,
    platform?: string,
}): Headers {
    const headers: Record<string, string> = {};
    if (options?.features) {
        headers['x-pm-drive-requirements'] = options.features;
    }
    if (options?.platform) {
        headers['x-pm-drive-platform-requirements'] = options.platform;
    }
    return new Headers(headers);
}

describe('processDriveRequirementHeaders', () => {
    const options = {
        clientSdkVersion: 'js@1.0.0-beta.1+abcdef01',
        supportedRequirementMasksByScope: {
            [RequirementScope.Drive]: TEST_FEATURE_MASK | TEST_FEATURE_MASK_2,
            [RequirementScope.Photos]: TEST_FEATURE_MASK,
            [RequirementScope.Docs]: TEST_FEATURE_MASK,
        },
        onUnsupportedFeature: jest.fn(),
        onRequiredUpdate: jest.fn(),
        onSuggestedUpdate: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('does not invoke callbacks when headers are absent', () => {
        processDriveRequirementHeaders(generateHeaders(), options);
        expect(options.onUnsupportedFeature).not.toHaveBeenCalled();
        expect(options.onRequiredUpdate).not.toHaveBeenCalled();
        expect(options.onSuggestedUpdate).not.toHaveBeenCalled();
    });

    describe('feature requirements', () => {
        it('does not invoke callbacks when feature requirements are met', () => {
            processDriveRequirementHeaders(
                generateHeaders({ features: `drive=${TEST_FEATURE_MASK} photos=${TEST_FEATURE_MASK} docs=${TEST_FEATURE_MASK}` }),
                options,
            );
            expect(options.onUnsupportedFeature).not.toHaveBeenCalled();
            expect(options.onRequiredUpdate).not.toHaveBeenCalled();
            expect(options.onSuggestedUpdate).not.toHaveBeenCalled();
        });

        it('does not invoke callbacks when the feature requirements for only one scope are met', () => {
            processDriveRequirementHeaders(
                generateHeaders({ features: `drive=${TEST_FEATURE_MASK | TEST_FEATURE_MASK_2}` }),
                options,
            );
            expect(options.onUnsupportedFeature).not.toHaveBeenCalled();
            expect(options.onRequiredUpdate).not.toHaveBeenCalled();
            expect(options.onSuggestedUpdate).not.toHaveBeenCalled();
        });

        it('calls onUnsupportedFeature when the API requires unknown feature bits for a known scope that is known for other scope', () => {
            processDriveRequirementHeaders(
                generateHeaders({ features: `photos=${TEST_FEATURE_MASK | TEST_FEATURE_MASK_2}` }),
                options,
            );
            expect(options.onUnsupportedFeature).toHaveBeenCalledTimes(1);
            expect(options.onUnsupportedFeature).toHaveBeenCalledWith(RequirementScope.Photos, TEST_FEATURE_MASK | TEST_FEATURE_MASK_2);
        });

        it('calls onUnsupportedFeature twice when the API requires unknown feature bits for a multiple scopes', () => {
            const driveMask = 1 << 7;
            const photosMask = 1 << 8;
            processDriveRequirementHeaders(
                generateHeaders({ features: `drive=${driveMask} photos=${photosMask} ` }),
                options,
            );
            expect(options.onUnsupportedFeature).toHaveBeenCalledTimes(2);
            expect(options.onUnsupportedFeature).toHaveBeenCalledWith(RequirementScope.Drive, driveMask);
            expect(options.onUnsupportedFeature).toHaveBeenCalledWith(RequirementScope.Photos, photosMask);
        });

        it('ignores requirement scopes that are not in supportedRequirementMasksByScope', () => {
            processDriveRequirementHeaders(
                generateHeaders({ features: `newscope=${TEST_FEATURE_MASK}` }),
                options,
            );
            expect(options.onUnsupportedFeature).not.toHaveBeenCalled();
        });

        it('ignores required scope when not correct header', () => {
            processDriveRequirementHeaders(generateHeaders({ features: `drive5` }), options);
            processDriveRequirementHeaders(generateHeaders({ features: `drive=` }), options);
            processDriveRequirementHeaders(generateHeaders({ features: `=` }), options);
            processDriveRequirementHeaders(generateHeaders({ features: `drive=-1` }), options);
            processDriveRequirementHeaders(generateHeaders({ features: `drive=NaN` }), options);
            expect(options.onUnsupportedFeature).not.toHaveBeenCalled();
            expect(options.onRequiredUpdate).not.toHaveBeenCalled();
            expect(options.onSuggestedUpdate).not.toHaveBeenCalled();
        });
    });

    describe('platform requirements', () => {
        it('does not invoke callbacks when platform requirements are met', () => {
            processDriveRequirementHeaders(
                generateHeaders({ platform: 'required=1.0.0 suggested=1.0.0' }),
                options,
            );
            expect(options.onUnsupportedFeature).not.toHaveBeenCalled();
            expect(options.onRequiredUpdate).not.toHaveBeenCalled();
            expect(options.onSuggestedUpdate).not.toHaveBeenCalled();
        });

        it('calls onRequiredUpdate when client SDK is below required and skips suggested in the same response', () => {
            processDriveRequirementHeaders(
                generateHeaders({ platform: 'required=2.0.0 suggested=3.0.0' }),
                options,
            );
            expect(options.onRequiredUpdate).toHaveBeenCalledTimes(1);
            expect(options.onRequiredUpdate).toHaveBeenCalledWith('2.0.0');
            expect(options.onSuggestedUpdate).not.toHaveBeenCalled();
        });

        it('calls onSuggestedUpdate when required is met but suggested is higher', () => {
            processDriveRequirementHeaders(
                generateHeaders({ platform: 'required=1.0.0 suggested=2.3.4' }),
                options,
            );
            expect(options.onRequiredUpdate).not.toHaveBeenCalled();
            expect(options.onSuggestedUpdate).toHaveBeenCalledTimes(1);
            expect(options.onSuggestedUpdate).toHaveBeenCalledWith('2.3.4');
        });

        it('ignores required platform when not correct header', () => {
            processDriveRequirementHeaders(generateHeaders({ platform: `required2.0.0` }), options);
            processDriveRequirementHeaders(generateHeaders({ platform: `required=` }), options);
            processDriveRequirementHeaders(generateHeaders({ platform: `=` }), options);
            processDriveRequirementHeaders(generateHeaders({ platform: `required=1.x` }), options);
            processDriveRequirementHeaders(generateHeaders({ platform: `required=1.2` }), options);
            processDriveRequirementHeaders(generateHeaders({ platform: `required=1.` }), options);
            expect(options.onUnsupportedFeature).not.toHaveBeenCalled();
            expect(options.onRequiredUpdate).not.toHaveBeenCalled();
            expect(options.onSuggestedUpdate).not.toHaveBeenCalled();
        });
    });
});
