using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Account.Api.Keys;

internal sealed class KeySaltListResponse : ApiResponse
{
    public required IReadOnlyList<KeySalt> KeySalts { get; init; }
}
