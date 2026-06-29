using System.Text.Json.Serialization;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Api.Shares;

[JsonConverter(typeof(StrongIdJsonConverter<ShareId>))]
internal readonly record struct ShareId : IStrongId<ShareId>
{
    private readonly string? _value;

    internal ShareId(string value)
    {
        ArgumentException.ThrowIfNullOrEmpty(value);

        _value = value;
    }

    public static explicit operator ShareId(string value) => new(value);

    public override string ToString()
    {
        return !string.IsNullOrEmpty(_value) ? _value : throw new InvalidOperationException("ID is not initialized");
    }
}
