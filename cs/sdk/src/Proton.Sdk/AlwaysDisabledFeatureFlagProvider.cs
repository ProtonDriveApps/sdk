namespace Proton.Sdk;

/// <summary>
/// Default feature flag provider which always returns false.
/// By default, don't use unstable features that are behind feature flags.
/// </summary>
internal sealed class AlwaysDisabledFeatureFlagProvider : IFeatureFlagProvider
{
    public static readonly IFeatureFlagProvider Instance = new AlwaysDisabledFeatureFlagProvider();

    private AlwaysDisabledFeatureFlagProvider()
    {
    }

    public bool IsEnabled(string flagName) => false;
}
