using System.Text.Json;
using System.Text.Json.Serialization;

namespace Proton.Drive.Sdk.Api.Files;

internal struct ExtendedAttributes
{
    public CommonExtendedAttributes? Common { get; init; }

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? AdditionalMetadata { get; set; }
}
