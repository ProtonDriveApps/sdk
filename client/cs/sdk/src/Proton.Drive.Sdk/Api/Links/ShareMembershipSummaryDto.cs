using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Shares;

namespace Proton.Drive.Sdk.Api.Links;

internal sealed class ShareMembershipSummaryDto
{
    [JsonPropertyName("ShareID")]
    public required ShareId ShareId { get; init; }

    [JsonPropertyName("MembershipID")]
    public required ShareMembershipId MembershipId { get; init; }

    public required ShareMemberPermissions Permissions { get; init; }
}
