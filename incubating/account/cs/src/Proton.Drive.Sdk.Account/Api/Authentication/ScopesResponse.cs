using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Account.Api.Authentication;

internal sealed class ScopesResponse : ApiResponse
{
    public required IReadOnlyList<string> Scopes { get; init; }
}
