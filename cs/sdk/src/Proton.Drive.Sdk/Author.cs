namespace Proton.Drive.Sdk;

public readonly struct Author(string? emailAddress)
{
    public static readonly Author Anonymous = default;

    public string? EmailAddress { get; } = emailAddress;
}
