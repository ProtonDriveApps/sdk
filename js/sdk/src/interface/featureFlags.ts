/**
 * Provides feature flag evaluation for controlling SDK behavior.
 * Applications must supply their own implementation.
 */
export interface FeatureFlagProvider {
    isEnabled(flagName: string, signal?: AbortSignal): Promise<boolean>;
}
