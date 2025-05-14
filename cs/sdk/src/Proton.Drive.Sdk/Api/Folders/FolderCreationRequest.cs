using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;
using Proton.Sdk.Cryptography;

namespace Proton.Drive.Sdk.Api.Folders;

internal sealed class FolderCreationRequest : NodeCreationRequest
{
    [JsonPropertyName("NodeHashKey")]
    public required PgpArmoredMessage HashKey { get; init; }
}
