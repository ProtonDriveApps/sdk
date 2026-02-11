namespace Proton.Sdk.Api.Authentication;

internal sealed class ScopesResponse : ApiResponse
{
    public required IReadOnlyList<string> Scopes { get; init; }
}
