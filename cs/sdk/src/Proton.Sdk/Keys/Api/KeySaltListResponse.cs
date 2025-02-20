using Proton.Sdk.Api;

namespace Proton.Sdk.Keys.Api;

internal sealed class KeySaltListResponse : ApiResponse
{
    public required IReadOnlyList<KeySalt> KeySalts { get; init; }
}
