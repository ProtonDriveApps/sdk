namespace Proton.Drive.Sdk.Nodes;

public class Error(string? message)
{
    public string? Message { get; } = message;
}
