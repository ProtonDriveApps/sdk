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

    public static T FreeHandle<T>(long handle)
        where T : class
    {
        var gcHandle = GCHandle.FromIntPtr((nint)handle);

        if (gcHandle.Target is not T target)
        {
            throw InvalidHandleException.Create<T>((nint)handle);
        }

        gcHandle.Free();

        return target;
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

        if (handleTarget is null)
        {
            throw InvalidHandleException.Create<T>(GCHandle.ToIntPtr(gcHandle));
        }

        try
        {
            return (T)handleTarget;
        }
        catch (InvalidCastException e)
        {
            throw new InvalidHandleException($"Expected handle for object of type {typeof(T)} but object was of type {handleTarget.GetType()}", e);
        }
    }
}
