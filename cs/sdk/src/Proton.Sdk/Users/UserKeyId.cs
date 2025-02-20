using Proton.Sdk.Serialization;

namespace Proton.Sdk.Users;

public readonly record struct UserKeyId(string Value) : IStrongId<UserKeyId>
{
    public static implicit operator UserKeyId(string value)
    {
        return new UserKeyId(value);
    }
}
