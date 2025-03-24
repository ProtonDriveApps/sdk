using System.Diagnostics.CodeAnalysis;
using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Serialization;
using Proton.Drive.Sdk.Volumes;

namespace Proton.Drive.Sdk.Nodes;

[JsonConverter(typeof(NodeUidConverter))]
public readonly record struct NodeUid
{
    internal NodeUid(VolumeId volumeId, LinkId linkId)
    {
        VolumeId = volumeId;
        LinkId = linkId;
    }

    internal VolumeId VolumeId { get; }
    internal LinkId LinkId { get; }

    public override string ToString()
    {
        return $"{VolumeId}~{LinkId}";
    }

    public static bool TryParse([NotNullWhen(true)] string? value, out NodeUid result)
    {
        if (string.IsNullOrEmpty(value))
        {
            result = default;
            return false;
        }

        var separatorIndex = value.IndexOf('~');

        if (separatorIndex < 0 || separatorIndex >= value.Length - 1)
        {
            result = default;
            return false;
        }

        var volumeId = value[..separatorIndex];
        var linkId = value[(separatorIndex + 1)..];

        result = new NodeUid(new VolumeId(volumeId), new LinkId(linkId));
        return true;
    }
}
