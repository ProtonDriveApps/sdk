using System.Text.Json.Serialization;

namespace Proton.Drive.Sdk;

public class ProtonDriveError(string? message, ProtonDriveError? innerError = null)
{
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Message { get; } = message;

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public ProtonDriveError? InnerError { get; } = innerError;
}
