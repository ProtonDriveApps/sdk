using System.Text.Json.Serialization;

namespace Proton.Drive.Sdk.Nodes;

[method: JsonConstructor]
public sealed class ExtendedAttributesDeserializationError(string? message, ProtonDriveError? innerError = null)
    : ProtonDriveError(message, innerError)
{
    public ExtendedAttributesDeserializationError(ProtonDriveError? innerError = null)
        : this("Could not read item's metadata", innerError)
    {
    }
}
