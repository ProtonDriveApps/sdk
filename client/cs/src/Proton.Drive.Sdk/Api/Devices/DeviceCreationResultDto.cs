using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Drive.Sdk.Devices;

namespace Proton.Drive.Sdk.Api.Devices;

internal sealed class DeviceCreationResultDto
{
    [JsonPropertyName("DeviceID")]
    public required DeviceUid Id { get; init; }

    [JsonPropertyName("ShareID")]
    public required ShareId ShareId { get; init; }

    [JsonPropertyName("LinkID")]
    public required LinkId RootLinkId { get; init; }
}
