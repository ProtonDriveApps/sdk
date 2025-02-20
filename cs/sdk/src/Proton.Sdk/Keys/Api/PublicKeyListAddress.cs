namespace Proton.Sdk.Keys.Api;

internal sealed record PublicKeyListAddress
{
    public required IReadOnlyList<PublicKeyEntry> Keys { get; init; }
}
