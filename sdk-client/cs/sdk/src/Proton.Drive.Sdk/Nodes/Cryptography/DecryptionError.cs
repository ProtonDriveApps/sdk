namespace Proton.Drive.Sdk.Nodes.Cryptography;

internal sealed class DecryptionError(string message, ProtonDriveError? innerError = null)
    : ProtonDriveError(message, innerError)
{
}
