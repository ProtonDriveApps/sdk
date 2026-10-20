using ProtonDriveNodeUid = Proton.Drive.Sdk.Nodes.NodeUid;
using SearchNodeUid = Proton.Drive.Sdk.Search.NodeUid;

namespace Proton.Drive.Sdk.Search;

internal static class SearchNodeUidMapping
{
    internal static SearchNodeUid ToSearchNodeUid(ProtonDriveNodeUid uid)
        => new(uid.VolumeId.ToString(), uid.LinkId.ToString());

    internal static string ToWireFormat(SearchNodeUid uid) => $"{uid.VolumeId}~{uid.NodeId}";

    internal static bool TryParseProtonDriveNodeUid(SearchNodeUid uid, out ProtonDriveNodeUid driveUid)
    {
        if (ProtonDriveNodeUid.TryParse(ToWireFormat(uid), out var parsed))
        {
            driveUid = parsed.Value;
            return true;
        }

        driveUid = default;
        return false;
    }
}
