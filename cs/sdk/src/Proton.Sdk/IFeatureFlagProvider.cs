namespace Proton.Sdk;

public interface IFeatureFlagProvider
{
    bool IsEnabled(string flagName);
}
