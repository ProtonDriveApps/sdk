using Proton.Sdk.Api;

namespace Proton.Sdk.Authentication.Api;

internal sealed class ScopesResponse : ApiResponse
{
    public required IReadOnlyList<string> Scopes { get; init; }
}
