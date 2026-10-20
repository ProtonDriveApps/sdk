using System.Threading.Channels;
using ProtonDriveNodeUid = Proton.Drive.Sdk.Nodes.NodeUid;

namespace Proton.Drive.Sdk.Search;

internal sealed class DriveSearchHitSink(ChannelWriter<DriveSearchHit> writer, HashSet<ProtonDriveNodeUid> seenNodeUids) : FoundItemSink
{
    private readonly ChannelWriter<DriveSearchHit> _writer = writer;
    private readonly HashSet<ProtonDriveNodeUid> _seenNodeUids = seenNodeUids;

    public Task SendHit(FoundItem item)
    {
        if (!SearchNodeUidMapping.TryParseProtonDriveNodeUid(item.NodeUid, out var nodeUid))
        {
            return Task.CompletedTask;
        }

        if (!_seenNodeUids.Add(nodeUid))
        {
            return Task.CompletedTask;
        }

        _writer.TryWrite(new DriveSearchHit(nodeUid, item.Score));
        return Task.CompletedTask;
    }
}
