using System.Text.Json.Serialization;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Api.Files;

internal readonly struct FileContentDigestsDto
{
    [JsonPropertyName("SHA1")]
    [JsonConverter(typeof(ForgivingBytesToHexJsonConverter))]
    public ReadOnlyMemory<byte>? Sha1 { get; init; }
}
