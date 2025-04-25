namespace Proton.Drive.Sdk.Api.Files;

public readonly struct BlockVerificationOutput
{
    public required ReadOnlyMemory<byte> Token { get; init; }
}
