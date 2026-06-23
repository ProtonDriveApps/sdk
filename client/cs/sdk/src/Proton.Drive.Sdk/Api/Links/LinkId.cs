using System.Text.Json.Serialization;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Api.Links;

[JsonConverter(typeof(StrongIdJsonConverter<LinkId>))]
internal readonly record struct LinkId : IStrongId<LinkId>
{
    private readonly string? _value;

    internal LinkId(string value)
    {
        ArgumentException.ThrowIfNullOrEmpty(value);

        _value = value;
    }

    public static explicit operator LinkId(string value)
    {
        return new LinkId(value);
    }

    public override string ToString()
    {
        return !string.IsNullOrEmpty(_value) ? _value : throw new InvalidOperationException("ID is not initialized");
    }
}
