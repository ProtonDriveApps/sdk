using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Volumes;
using Proton.Sdk.Addresses;
using Proton.Sdk.Api;
using Proton.Sdk.Cryptography;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Api.Shares;

internal sealed class ShareResponse : ApiResponse
{
    [JsonPropertyName("ShareID")]
    public required ShareId Id { get; init; }

    [JsonPropertyName("VolumeID")]
    public required VolumeId VolumeId { get; init; }

    public required ShareType Type { get; init; }

    public required ShareState State { get; init; }

    [JsonPropertyName("Creator")]
    public required string CreatorEmailAddress { get; init; }

    [JsonPropertyName("Locked")]
    public bool IsLocked { get; init; }

    [JsonPropertyName("CreateTime")]
    [JsonConverter(typeof(EpochSecondsJsonConverter))]
    public DateTime? CreationTime { get; init; }

    [JsonPropertyName("ModifyTime")]
    [JsonConverter(typeof(EpochSecondsJsonConverter))]
    public DateTime? ModificationTime { get; init; }

    [JsonPropertyName("LinkID")]
    public required LinkId RootLinkId { get; init; }

    [JsonPropertyName("LinkType")]
    public required LinkType RootLinkType { get; init; }

    public required PgpArmoredPrivateKey Key { get; init; }

    [JsonPropertyName("Passphrase")]
    public required PgpArmoredMessage Passphrase { get; init; }

    [JsonPropertyName("PassphraseSignature")]
    public PgpArmoredSignature? PassphraseSignature { get; init; }

    [JsonPropertyName("AddressID")]
    public required AddressId AddressId { get; init; }

    public required IReadOnlyList<ShareMembershipDto> Memberships { get; init; }
}
