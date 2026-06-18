using Google.Protobuf;
using Google.Protobuf.WellKnownTypes;

namespace Proton.Sdk.CExports;

internal static class InteropCancellationTokenSource
{
    public static IMessage HandleCreate(CancellationTokenSourceCreateRequest request)
    {
        return new Int64Value { Value = Interop.AllocHandle(new CancellationTokenSource()) };
    }

    public static IMessage? HandleCancel(CancellationTokenSourceCancelRequest request)
    {
        var cancellationTokenSource = Interop.GetFromHandle<CancellationTokenSource>(request.CancellationTokenSourceHandle);

        cancellationTokenSource.Cancel();

        return null;
    }

    public static IMessage? HandleFree(CancellationTokenSourceFreeRequest request)
    {
        var cancellationTokenSource = Interop.FreeHandle<CancellationTokenSource>(request.CancellationTokenSourceHandle);

        cancellationTokenSource.Dispose();

        return null;
    }
}
