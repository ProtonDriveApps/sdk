using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace Proton.Sdk.CExports;

internal static class Interop
{
    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    internal static long AllocHandle<T>(T obj)
        where T : class
    {
        return GCHandle.ToIntPtr(GCHandle.Alloc(obj));
    }

    internal static T GetFromHandle<T>(long handle)
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

        return GetFromHandle<T>(gcHandle);
    }

    internal static T GetFromHandle<T>(GCHandle gcHandle)
        where T : class
    {
        return (T)(gcHandle.Target ?? throw InvalidHandleException.Create<T>(GCHandle.ToIntPtr(gcHandle)));
    }

    internal static void FreeHandle<T>(long handle)
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
    internal static CancellationToken GetCancellationToken(long cancellationTokenSourceHandle)
    {
        return GetFromHandle<CancellationTokenSource>(cancellationTokenSourceHandle).Token;
    }
}
