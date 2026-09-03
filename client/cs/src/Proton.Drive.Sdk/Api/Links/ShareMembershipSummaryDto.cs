using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Shares;
using Proton.Sdk.Cryptography;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Api.Links;

internal sealed class ShareMembershipSummaryDto
{
    [JsonPropertyName("ShareID")]
    public required ShareId ShareId { get; init; }

    [JsonPropertyName("MembershipID")]
    public required ShareMembershipId MembershipId { get; init; }

    public required ShareMemberPermissions Permissions { get; init; }

    [JsonPropertyName("InviteTime")]
    [JsonConverter(typeof(EpochSecondsJsonConverter))]
    public DateTime InviteTime { get; init; }

    [JsonPropertyName("InviterEmail")]
    public string? InviterEmailAddress { get; init; }

    public ReadOnlyMemory<byte>? MemberSharePassphraseKeyPacket { get; init; }

    public PgpArmoredSignature? InviterSharePassphraseKeyPacketSignature { get; init; }
}
