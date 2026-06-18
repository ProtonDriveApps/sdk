using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;

namespace Proton.Drive.Sdk.Api.Folders;

internal readonly struct FolderId
{
    [JsonPropertyName("ID")]
    public required LinkId Value { get; init; }
}
