import { FeatureFlagProvider } from './interface/featureFlags';

/**
 * Default feature flag provider that returns false for all flags.
 */
export class NullFeatureFlagProvider implements FeatureFlagProvider {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    isEnabled(flagName: string): boolean {
        return false;
    }
}
