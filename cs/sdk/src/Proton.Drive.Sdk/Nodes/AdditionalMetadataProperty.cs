using System.Text.Json;

namespace Proton.Drive.Sdk.Nodes;

public record struct AdditionalMetadataProperty(string Name, JsonElement Value);
