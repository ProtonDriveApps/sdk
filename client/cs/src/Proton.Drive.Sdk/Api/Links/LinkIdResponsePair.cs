using System.Text.Json.Serialization;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Links;

internal readonly record struct LinkIdResponsePair<TResponse>(
    [property: JsonPropertyName("LinkID")] LinkId LinkId,
    TResponse Response)
    where TResponse : ApiResponse;
