using System.Diagnostics.CodeAnalysis;
using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Api.Files;
using Proton.Drive.Sdk.Api.Links;
using Proton.Drive.Sdk.Serialization;
using Proton.Drive.Sdk.Volumes;

namespace Proton.Drive.Sdk.Nodes;

[JsonConverter(typeof(UidJsonConverter<RevisionUid>))]
public readonly record struct RevisionUid : ICompositeUid<RevisionUid>
{
    internal RevisionUid(NodeUid nodeUid, RevisionId revisionId)
    {
        NodeUid = nodeUid;
        RevisionId = revisionId;
    }

    internal RevisionUid(VolumeId volumeId, LinkId linkId, RevisionId revisionId)
    {
        NodeUid = new NodeUid(volumeId, linkId);
        RevisionId = revisionId;
    }

    internal NodeUid NodeUid { get; }
    internal RevisionId RevisionId { get; }

    public override string ToString()
    {
        return $"{NodeUid}~{RevisionId}";
    }

    public static bool TryParse(string s, [NotNullWhen(true)] out RevisionUid? result)
    {
        return ICompositeUid<RevisionUid>.TryParse(s, out result);
    }

    public static RevisionUid Parse(string s)
    {
        return ICompositeUid<RevisionUid>.TryParse(s, out var result)
            ? result.Value
            : throw new FormatException($"Invalid revision UID format: \"{s}\"");
    }

    static bool ICompositeUid<RevisionUid>.TryCreate(string baseUidString, string relativeIdString, [NotNullWhen(true)] out RevisionUid? uid)
    {
        if (!ICompositeUid<NodeUid>.TryParse(baseUidString, out var nodeUid))
        {
            uid = null;
            return false;
        }

        uid = new RevisionUid(nodeUid.Value, new RevisionId(relativeIdString));
        return true;
    }

    internal void Deconstruct(out NodeUid nodeUid, out RevisionId revisionId)
    {
        nodeUid = NodeUid;
        revisionId = RevisionId;
    }
}
