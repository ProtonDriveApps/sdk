using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Shares;

internal sealed class ShareResponseV2 : ApiResponse
{
    public required ShareVolumeDto Volume { get; init; }

    public required ShareDto Share { get; init; }

    [JsonPropertyName("Link")]
    public required LinkDetailsDto LinkDetails { get; init; }

    public void Deconstruct(out ShareVolumeDto volume, out ShareDto share, out LinkDetailsDto linkDetails)
    {
        volume = Volume;
        share = Share;
        linkDetails = LinkDetails;
    }
}
