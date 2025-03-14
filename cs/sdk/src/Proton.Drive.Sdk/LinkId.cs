using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk;

public readonly record struct LinkId(string Value) : IStrongId<LinkId>
{
    public static implicit operator LinkId(string value)
    {
        return new LinkId(value);
    }
}
