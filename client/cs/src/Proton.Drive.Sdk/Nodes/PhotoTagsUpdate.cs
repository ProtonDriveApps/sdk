namespace Proton.Drive.Sdk.Nodes;

public sealed record PhotoTagsUpdate
{
    public required NodeUid NodeUid { get; init; }

    public required IReadOnlyList<PhotoTag> TagsToAdd { get; init; }

    public required IReadOnlyList<PhotoTag> TagsToRemove { get; init; }
}
