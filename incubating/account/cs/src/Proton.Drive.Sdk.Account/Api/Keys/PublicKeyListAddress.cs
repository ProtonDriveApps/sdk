namespace Proton.Drive.Sdk.Account.Api.Keys;

internal sealed record PublicKeyListAddress
{
    public required IReadOnlyList<PublicKeyEntry> Keys { get; init; }
}
