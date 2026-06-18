using System.Text.Json.Serialization;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Api.Files;

[JsonConverter(typeof(StrongIdJsonConverter<RevisionId>))]
internal readonly record struct RevisionId : IStrongId<RevisionId>
{
    private readonly string? _value;

    internal RevisionId(string? value)
    {
        _value = value;
    }

    public static explicit operator RevisionId(string? value)
    {
        return new RevisionId(value);
    }

    public override string ToString()
    {
        return _value ?? string.Empty;
    }
}
