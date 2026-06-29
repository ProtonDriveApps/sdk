using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api;

internal sealed class AggregateApiResponse<T> : ApiResponse
{
    public required IReadOnlyList<T> Responses { get; init; }
}
