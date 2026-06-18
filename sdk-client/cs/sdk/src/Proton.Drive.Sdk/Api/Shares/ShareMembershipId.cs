using System.Text.Json.Serialization;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Api.Shares;

[JsonConverter(typeof(StrongIdJsonConverter<ShareMembershipId>))]
internal readonly record struct ShareMembershipId : IStrongId<ShareMembershipId>
{
    private readonly string? _value;

    internal ShareMembershipId(string? value)
    {
        _value = value;
    }

    public static explicit operator ShareMembershipId(string? value) => new(value);

    public override string ToString()
    {
        return _value ?? string.Empty;
    }
}
