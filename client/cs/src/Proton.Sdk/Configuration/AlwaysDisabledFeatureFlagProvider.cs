namespace Proton.Sdk.Configuration;

/// <summary>
/// Default feature flag provider which always returns false.
/// By default, don't use unstable features that are behind feature flags.
/// </summary>
public sealed class AlwaysDisabledFeatureFlagProvider : IFeatureFlagProvider
{
    public static readonly IFeatureFlagProvider Instance = new AlwaysDisabledFeatureFlagProvider();

    private AlwaysDisabledFeatureFlagProvider()
    {
    }

    public Task<bool> IsEnabledAsync(string flagName, CancellationToken cancellationToken)
    {
        return Task.FromResult(false);
    }
}
