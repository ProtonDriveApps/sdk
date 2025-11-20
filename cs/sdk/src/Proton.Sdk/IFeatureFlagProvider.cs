namespace Proton.Sdk;

public interface IFeatureFlagProvider
{
    Task<bool> IsEnabledAsync(string flagName, CancellationToken cancellationToken);
}
