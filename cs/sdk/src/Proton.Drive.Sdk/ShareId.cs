using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk;

public readonly record struct ShareId(string Value) : IStrongId<ShareId>
{
    public static implicit operator ShareId(string value)
    {
        return new ShareId(value);
    }
}
