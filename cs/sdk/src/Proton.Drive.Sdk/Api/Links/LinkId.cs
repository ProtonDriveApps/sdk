using System.Text.Json.Serialization;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Api.Links;

[JsonConverter(typeof(StrongIdJsonConverter<LinkId>))]
internal readonly record struct LinkId : IStrongId<LinkId>
{
    private readonly string? _value;

    internal LinkId(string? value)
    {
        _value = value;
    }

    public static explicit operator LinkId(string? value)
    {
        return new LinkId(value);
    }

    public override string ToString()
    {
        return _value ?? string.Empty;
    }
}
