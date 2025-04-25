using System.Diagnostics.CodeAnalysis;
using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Serialization;

namespace Proton.Drive.Sdk.Nodes;

[JsonConverter(typeof(UidJsonConverter<RevisionUid>))]
public readonly record struct RevisionUid : ICompositeUid<RevisionUid>
{
    internal RevisionUid(NodeUid nodeUid, RevisionId revisionId)
    {
        NodeUid = nodeUid;
        RevisionId = revisionId;
    }

    internal NodeUid NodeUid { get; }
    internal RevisionId RevisionId { get; }

    public override string ToString()
    {
        return $"{NodeUid.VolumeId}-{NodeUid.LinkId}~{RevisionId}";
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
