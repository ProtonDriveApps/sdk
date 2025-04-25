namespace Proton.Drive.Sdk.Api.Files;

internal sealed record BlockVerificationInputResponse
{
    public required ReadOnlyMemory<byte> VerificationCode { get; init; }

    public required ReadOnlyMemory<byte> ContentKeyPacket { get; init; }
}
