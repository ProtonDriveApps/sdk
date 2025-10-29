using System.Text.Json.Serialization;
using Proton.Sdk.Addresses;
using Proton.Sdk.Cryptography;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Api.Shares;

internal sealed class ShareMembershipDto
{
    [JsonPropertyName("MemberID")]
    public required ShareMembershipId Id { get; init; }

    [JsonPropertyName("ShareID")]
    public required ShareId ShareId { get; init; }

    [JsonPropertyName("AddressID")]
    public required AddressId AddressId { get; init; }

    [JsonPropertyName("AddressKeyID")]
    public required AddressKeyId AddressKeyId { get; init; }

    [JsonPropertyName("Inviter")]
    public required string InviterEmailAddress { get; init; }

    public required ShareMemberPermissions Permissions { get; init; }

    public required ReadOnlyMemory<byte> KeyPacket { get; init; }

    public PgpArmoredSignature? KeyPacketSignature { get; init; }

    public PgpArmoredSignature? SessionKeySignature { get; init; }

    public required ShareMembershipState State { get; init; }

    [JsonPropertyName("Unlockable")]
    public bool? CanBeUnlocked { get; init; }

    [JsonPropertyName("CreateTime")]
    [JsonConverter(typeof(EpochSecondsJsonConverter))]
    public required DateTime CreationTime { get; init; }

    [JsonPropertyName("ModifyTime")]
    [JsonConverter(typeof(EpochSecondsJsonConverter))]
    public required DateTime ModificationTime { get; init; }
}
