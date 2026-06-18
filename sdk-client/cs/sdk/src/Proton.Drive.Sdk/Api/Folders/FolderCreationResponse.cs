using System.Text.Json.Serialization;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Folders;

internal sealed class FolderCreationResponse : ApiResponse
{
    [JsonPropertyName("Folder")]
    public required FolderId FolderId { get; init; }
}
