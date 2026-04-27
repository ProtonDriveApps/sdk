using System.Text.Json;
using Google.Protobuf.Collections;

namespace Proton.Drive.Sdk.CExports;

internal static class InteropDriveProtobufMetadata
{
    internal static IEnumerable<Proton.Drive.Sdk.Nodes.AdditionalMetadataProperty>? ParseAdditionalMetadata(
        RepeatedField<AdditionalMetadataProperty> additionalMetadata) =>
        additionalMetadata.Count > 0
            ? additionalMetadata.Select(x =>
                new Proton.Drive.Sdk.Nodes.AdditionalMetadataProperty(
                    x.Name,
                    JsonDocument.Parse(x.Utf8JsonValue.Memory).RootElement))
            : null;
}
