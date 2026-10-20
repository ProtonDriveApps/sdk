using Google.Protobuf;
using SdkDriveSearchDateRange = Proton.Drive.Sdk.Search.DriveSearchDateRange;
using SdkDriveSearchLogicalIndex = Proton.Drive.Sdk.Search.DriveSearchLogicalIndex;
using SdkDriveSearchQuery = Proton.Drive.Sdk.Search.DriveSearchQuery;
using SdkDriveSearchSizeRange = Proton.Drive.Sdk.Search.DriveSearchSizeRange;
using SdkDriveSearchWorkSchedule = Proton.Drive.Sdk.Search.DriveSearchWorkSchedule;
using SdkStructuredSearchQuery = Proton.Drive.Sdk.Search.DriveStructuredSearchQuery;

namespace Proton.Drive.Sdk.CExports;

internal static class InteropProtonDriveClientSearch
{
    public static async ValueTask<IMessage> HandleUpdateSearchIndexesAsync(DriveClientUpdateSearchIndexesRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);
        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        var schedule = await client.UpdateSearchIndexesAsync(cancellationToken).ConfigureAwait(false);

        return ToProtoSchedule(schedule);
    }

    public static async ValueTask<IMessage> HandleProcessSearchExtractionQueueAsync(
        DriveClientProcessSearchExtractionQueueRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);
        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        var schedule = await client.ProcessSearchExtractionQueueAsync(cancellationToken).ConfigureAwait(false);

        return ToProtoSchedule(schedule);
    }

    public static async ValueTask<IMessage?> HandleRemoveNodeFromSearchIndexesAsync(
        DriveClientRemoveNodeFromSearchIndexesRequest request)
    {
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);
        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        var nodeUids = request.NodeUids.Select(Proton.Drive.Sdk.Nodes.NodeUid.Parse).ToList();
        await client.RemoveNodeFromSearchIndexesAsync(nodeUids, cancellationToken).ConfigureAwait(false);

        return null;
    }

    public static async ValueTask<IMessage?> HandleQueryAsync(DriveClientQueryRequest request, nint bindingsHandle)
    {
        var yieldAction = new InteropAction<nint, InteropArray<byte>>(request.YieldAction);
        var cancellationToken = Interop.GetCancellationToken(request.CancellationTokenSourceHandle);
        var client = Interop.GetFromHandle<ProtonDriveClient>(request.ClientHandle);

        var query = ToDriveSearchQuery(request);
        var index = ToDriveSearchLogicalIndex(request.Index);

        await foreach (var hit in client.QueryAsync(index, query, cancellationToken).ConfigureAwait(false))
        {
            yieldAction.InvokeWithMessage(bindingsHandle, hit.ToInterop());
        }

        return null;
    }

    private static DriveSearchWorkSchedule ToProtoSchedule(SdkDriveSearchWorkSchedule schedule)
    {
        return new()
        {
            RecommendedNextCallAfterMs = (long)schedule.RecommendedNextCallAfter.TotalMilliseconds,
        };
    }

    private static SdkDriveSearchLogicalIndex ToDriveSearchLogicalIndex(DriveSearchLogicalIndex protoIndex)
    {
        return protoIndex switch
        {
            DriveSearchLogicalIndex.RecentNodes => SdkDriveSearchLogicalIndex.RecentNodes,
            _ => throw new ArgumentOutOfRangeException(nameof(protoIndex)),
        };
    }

    private static SdkDriveSearchQuery ToDriveSearchQuery(DriveClientQueryRequest request)
    {
        return request.QueryCase switch
        {
            DriveClientQueryRequest.QueryOneofCase.Text => new SdkDriveSearchQuery.Text(request.Text),
            DriveClientQueryRequest.QueryOneofCase.Structured => new SdkDriveSearchQuery.Structured(ToStructured(request.Structured)),
            _ => throw new ArgumentException("Query must be text or structured.", nameof(request)),
        };
    }

    private static SdkStructuredSearchQuery ToStructured(DriveStructuredSearchQuery proto)
    {
        return new()
        {
            Name = proto.Name,
            ParentUid = string.IsNullOrEmpty(proto.ParentUid) ? null : Proton.Drive.Sdk.Nodes.NodeUid.Parse(proto.ParentUid),
            MediaType = string.IsNullOrEmpty(proto.MediaType) ? null : proto.MediaType,
            CreatedBy = string.IsNullOrEmpty(proto.CreatedBy) ? null : proto.CreatedBy,
            OwnedBy = string.IsNullOrEmpty(proto.OwnedBy) ? null : proto.OwnedBy,
            CreationTime = ToDateRange(proto.CreationTime),
            ModificationTime = ToDateRange(proto.ModificationTime),
            LastAccessTime = ToDateRange(proto.LastAccessTime),
            Size = ToSizeRange(proto.Size),
        };
    }

    private static SdkDriveSearchDateRange? ToDateRange(DriveSearchDateRange proto)
    {
        if (proto is null)
        {
            return null;
        }

        var hasFrom = proto.From is not null;
        var hasTo = proto.To is not null;
        if (!hasFrom && !hasTo)
        {
            return null;
        }

        return new SdkDriveSearchDateRange(
            hasFrom ? proto.From!.ToDateTimeOffset() : null,
            hasTo ? proto.To!.ToDateTimeOffset() : null);
    }

    private static SdkDriveSearchSizeRange? ToSizeRange(DriveSearchSizeRange proto)
    {
        if (proto is null)
        {
            return null;
        }

        if (!proto.HasFrom && !proto.HasTo)
        {
            return null;
        }

        return new SdkDriveSearchSizeRange(
            proto.HasFrom ? proto.From : null,
            proto.HasTo ? proto.To : null);
    }
}
