using System.Text.Json.Serialization;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Volumes;

internal sealed class VolumeTrashResponse : ApiResponse
{
    [JsonPropertyName("Trash")]
    public IReadOnlyList<ShareTrashDto> TrashByShare { get; init; }
}
