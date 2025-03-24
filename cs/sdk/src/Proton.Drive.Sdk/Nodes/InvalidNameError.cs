namespace Proton.Drive.Sdk.Nodes;

internal sealed class InvalidNameError(string name, string message)
    : Error(message)
{
    public string Name { get; } = name;
}
