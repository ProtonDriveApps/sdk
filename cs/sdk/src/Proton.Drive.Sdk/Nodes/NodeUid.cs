using System.Diagnostics.CodeAnalysis;
using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Serialization;
using Proton.Drive.Sdk.Volumes;

namespace Proton.Drive.Sdk.Nodes;

[JsonConverter(typeof(UidJsonConverter<NodeUid>))]
public readonly record struct NodeUid : ICompositeUid<NodeUid>
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

    public static bool TryParse(string s, [NotNullWhen(true)] out NodeUid? result)
    {
        return ICompositeUid<NodeUid>.TryParse(s, out result);
    }

    static bool ICompositeUid<NodeUid>.TryCreate(string baseUidString, string relativeIdString, [NotNullWhen(true)] out NodeUid? uid)
    {
        uid = new NodeUid(new VolumeId(baseUidString), new LinkId(relativeIdString));
        return true;
    }

    internal void Deconstruct(out VolumeId volumeId, out LinkId linkId)
    {
        volumeId = VolumeId;
        linkId = LinkId;
    }
}
