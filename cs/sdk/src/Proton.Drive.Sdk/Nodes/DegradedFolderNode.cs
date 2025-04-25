using Proton.Sdk;

namespace Proton.Drive.Sdk.Nodes;

public sealed class DegradedFolderNode : DegradedNode
{
    public FolderNode ToNode(string substituteName)
    {
        return new FolderNode
        {
            Uid = Id,
            ParentUid = ParentId,
            Name = Name.TryGetValue(out var name) ? name : substituteName,
            NameAuthor = NameAuthor,
            IsTrashed = IsTrashed,
            Author = Author,
        };
    }
}
