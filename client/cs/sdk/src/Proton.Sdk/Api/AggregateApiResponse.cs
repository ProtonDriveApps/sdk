namespace Proton.Sdk.Api;

public sealed class AggregateApiResponse<T> : ApiResponse
{
    public required IReadOnlyList<T> Responses { get; init; }
}
