using System.Text.Json.Serialization;

namespace Proton.Drive.Sdk.Api.Files;

internal class BlockUploadTarget
{
    [JsonPropertyName("BareURL")]
    public required string BareUrl { get; set; }

    public required string Token { get; set; }
}
