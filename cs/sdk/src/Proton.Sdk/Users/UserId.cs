using Proton.Sdk.Serialization;

namespace Proton.Sdk.Users;

public readonly record struct UserId(string Value) : IStrongId<UserId>
{
    public static implicit operator UserId(string value)
    {
        return new UserId(value);
    }
}
