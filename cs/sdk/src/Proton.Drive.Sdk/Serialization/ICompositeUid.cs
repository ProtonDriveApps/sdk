using System.Diagnostics.CodeAnalysis;

namespace Proton.Drive.Sdk.Serialization;

internal interface ICompositeUid<TUid>
    where TUid : struct, ICompositeUid<TUid>
{
    static abstract bool TryCreate(string baseUidString, string relativeIdString, [NotNullWhen(true)] out TUid? uid);

    static bool TryParse([NotNullWhen(true)] string? value, [NotNullWhen(true)] out TUid? result)
    {
        if (string.IsNullOrEmpty(value))
        {
            result = null;
            return false;
        }

        var separatorIndex = value.LastIndexOf('~');

        if (separatorIndex < 0 || separatorIndex >= value.Length - 1)
        {
            result = null;
            return false;
        }

        var baseUidString = value[..separatorIndex];
        var relativeIdString = value[(separatorIndex + 1)..];

        return TUid.TryCreate(baseUidString, relativeIdString, out result);
    }
}
