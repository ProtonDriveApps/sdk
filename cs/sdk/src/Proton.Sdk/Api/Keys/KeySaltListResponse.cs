namespace Proton.Sdk.Api.Keys;

internal sealed class KeySaltListResponse : ApiResponse
{
    public required IReadOnlyList<KeySalt> KeySalts { get; init; }
}
