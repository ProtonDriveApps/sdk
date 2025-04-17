using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Links;

internal class ContextShareResponse : ApiResponse
{
    [JsonPropertyName("ContextShareID")]
    public required ShareId ContextShareId { get; init; }
}
