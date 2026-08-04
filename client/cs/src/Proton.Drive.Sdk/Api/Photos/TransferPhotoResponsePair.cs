using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;

namespace Proton.Drive.Sdk.Api.Photos;

internal readonly record struct TransferPhotoResponsePair(
    [property: JsonPropertyName("LinkID")] LinkId LinkId,
    [property: JsonPropertyName("Response")] TransferPhotoResponse Response);
