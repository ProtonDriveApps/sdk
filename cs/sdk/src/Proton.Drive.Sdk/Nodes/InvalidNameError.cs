namespace Proton.Drive.Sdk.Nodes;

internal sealed class InvalidNameError(string name, string message)
    : ProtonDriveError(message)
{
    public string Name { get; } = name;
}
