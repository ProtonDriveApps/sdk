using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace Proton.Sdk.CExports;

internal static class Interop
{
    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public static long AllocHandle<T>(T obj)
        where T : class
    {
        return GCHandle.ToIntPtr(GCHandle.Alloc(obj));
    }

    public static T GetFromHandle<T>(long handle)
        where T : class
    {
        return GetFromHandle<T>(handle, free: false);
    }

    public static T GetFromHandleAndFree<T>(long handle)
        where T : class
    {
        return GetFromHandle<T>(handle, free: true);
    }

    public static void FreeHandle<T>(long handle)
        where T : class
    {
        var gcHandle = GCHandle.FromIntPtr((nint)handle);

        if (gcHandle.Target is not T)
        {
            throw InvalidHandleException.Create<T>((nint)handle);
        }

        gcHandle.Free();
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public static CancellationToken GetCancellationToken(long cancellationTokenSourceHandle)
    {
        return GetFromHandle<CancellationTokenSource>(cancellationTokenSourceHandle).Token;
    }

    private static T GetFromHandle<T>(long handle, bool free)
        where T : class
    {
        GCHandle gcHandle;
        try
        {
            gcHandle = GCHandle.FromIntPtr((nint)handle);
        }
        catch (Exception e)
        {
            throw InvalidHandleException.Create<T>((nint)handle, e);
        }

        var handleTarget = gcHandle.Target;

        if (free)
        {
            gcHandle.Free();
        }

        return (T)(handleTarget ?? throw InvalidHandleException.Create<T>(GCHandle.ToIntPtr(gcHandle)));
    }
}
