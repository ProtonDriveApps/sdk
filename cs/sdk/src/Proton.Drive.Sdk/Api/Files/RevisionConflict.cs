using System.Text.Json;
using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Serialization;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Files;

internal sealed class RevisionConflict
{
    [JsonPropertyName("ConflictLinkID")]
    public LinkId? LinkId { get; init; }

    [JsonPropertyName("ConflictRevisionID")]
    public RevisionId? RevisionId { get; init; }

    [JsonPropertyName("ConflictDraftRevisionID")]
    public RevisionId? DraftRevisionId { get; init; }

    [JsonPropertyName("ConflictDraftClientUID")]
    public string? DraftClientUid { get; init; }

    public static RevisionConflict? FromErrorResponse(RevisionErrorResponse? errorResponse)
    {
        return errorResponse?.Code is ResponseCode.AlreadyExists
            ? errorResponse.Details?.Deserialize(DriveApiSerializerContext.Default.RevisionConflict)
            : null;
    }
}
