using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Api.Shares;

namespace Proton.Drive.Sdk.Api.Devices;

internal sealed class DeviceShareDataDto
{
    [JsonPropertyName("ShareID")]
    public required ShareId Id { get; init; }

    [JsonPropertyName("LinkID")]
    public required LinkId RootLinkId { get; init; }

    /// <summary>
    /// Deprecated: the device name used to be stored on the share. Present only for old devices.
    /// </summary>
    public string? Name { get; init; }
}
