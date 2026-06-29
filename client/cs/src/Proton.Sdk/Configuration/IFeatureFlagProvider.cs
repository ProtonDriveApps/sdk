namespace Proton.Sdk.Configuration;

public interface IFeatureFlagProvider
{
    Task<bool> IsEnabledAsync(string flagName, CancellationToken cancellationToken);
}
