using System.Text.Json.Serialization;

namespace Proton.Drive.Sdk.Nodes;

[method: JsonConstructor]
public sealed class ExtendedAttributesDeserializationError(ProtonDriveError? innerError = null)
    : ProtonDriveError("Failed to deserialize extended attributes", innerError)
{
}
