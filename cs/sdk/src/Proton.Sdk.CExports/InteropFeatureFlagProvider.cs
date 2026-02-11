using System.Text;

namespace Proton.Sdk.CExports;

/// <summary>
/// Feature flag provider that calls back to the bindings layer (e.g., Swift) to get feature flag values.
/// </summary>
internal sealed class InteropFeatureFlagProvider : IFeatureFlagProvider
{
    private readonly nint _bindingsHandle;
    private readonly InteropFunction<nint, InteropArray<byte>, int> _isEnabledFunc;

    public InteropFeatureFlagProvider(nint bindingsHandle, InteropFunction<nint, InteropArray<byte>, int> isEnabledFunc)
    {
        _bindingsHandle = bindingsHandle;
        _isEnabledFunc = isEnabledFunc;
    }

    public unsafe Task<bool> IsEnabledAsync(string flagName, CancellationToken cancellationToken)
    {
        // Convert the flag name to UTF-8 bytes
        var flagNameBytes = Encoding.UTF8.GetBytes(flagName);

        fixed (byte* flagNamePointer = flagNameBytes)
        {
            var result = _isEnabledFunc.Invoke(_bindingsHandle, new InteropArray<byte>(flagNamePointer, flagNameBytes.Length));
            return Task.FromResult(result != 0);
        }
    }
}
