using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

internal sealed class InvalidNameError(string name, Result<Author, SignatureVerificationError> author, string message)
    : ProtonDriveError(message)
{
    public string Name { get; } = name;
    public Result<Author, SignatureVerificationError> Author { get; } = author;
}
