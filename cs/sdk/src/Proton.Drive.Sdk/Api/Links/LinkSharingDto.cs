using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Shares;

namespace Proton.Drive.Sdk.Api.Links;

internal sealed class LinkSharingDto
{
    [JsonPropertyName("ShareID")]
    public required ShareId ShareId { get; init; }
}
