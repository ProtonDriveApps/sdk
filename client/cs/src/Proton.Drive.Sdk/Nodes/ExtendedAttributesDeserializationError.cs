using System.Text.Json.Serialization;

namespace Proton.Drive.Sdk.Nodes;

[method: JsonConstructor]
public sealed class ExtendedAttributesDeserializationError(string? message, ProtonDriveError? innerError = null)
    : ProtonDriveError(message, innerError)
{
    public ExtendedAttributesDeserializationError(ProtonDriveError? innerError = null)
        : this("Failed to deserialize extended attributes", innerError)
    {
    }
}
