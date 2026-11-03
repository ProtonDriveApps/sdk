using System.Text.Json.Serialization;
using Proton.Sdk;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Api.Files;

internal sealed class CommonExtendedAttributes
{
    public long? Size { get; init; }

    [JsonConverter(typeof(Iso8601DateTimeOffsetResultJsonConverter))]
    public Result<DateTimeOffset, ProtonDriveError>? ModificationTime { get; init; }

    public IReadOnlyList<int>? BlockSizes { get; init; }

    public FileContentDigestsDto? Digests { get; init; }
}
