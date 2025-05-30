namespace Proton.Sdk.Api;

internal sealed class AggregateApiResponse<T> : ApiResponse
{
    public required IReadOnlyList<T> Responses { get; init; }
}
