using Proton.Sdk.Serialization;

namespace Proton.Sdk.Authentication;

public readonly record struct SessionId(string Value) : IStrongId<SessionId>
{
    public static implicit operator SessionId(string value)
    {
        return new SessionId(value);
    }
}
