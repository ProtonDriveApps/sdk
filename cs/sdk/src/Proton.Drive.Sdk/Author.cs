using System.Diagnostics.CodeAnalysis;

namespace Proton.Drive.Sdk;

public readonly record struct Author
{
    public static readonly Author Anonymous = default;

    public string? EmailAddress { get; init; }

    public bool TryGetIdentity([MaybeNullWhen(false)] out string emailAddress)
    {
        if (EmailAddress is null)
        {
            emailAddress = null;
            return false;
        }

        emailAddress = EmailAddress;
        return true;
    }
}
