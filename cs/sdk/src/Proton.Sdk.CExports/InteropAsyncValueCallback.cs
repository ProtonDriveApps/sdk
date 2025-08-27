using System.Runtime.InteropServices;

namespace Proton.Sdk.CExports;

[StructLayout(LayoutKind.Sequential)]
internal readonly unsafe struct InteropAsyncValueCallback<T>(
    delegate* unmanaged[Cdecl]<void*, T, void> onSuccess,
    delegate* unmanaged[Cdecl]<void*, InteropArray<byte>, void> onFailure,
    nint cancellationTokenSourceHandle)
    where T : unmanaged
{
    public readonly delegate* unmanaged[Cdecl]<void*, T, void> OnSuccess = onSuccess;
    public readonly delegate* unmanaged[Cdecl]<void*, InteropArray<byte>, void> OnFailure = onFailure;
    public readonly nint CancellationTokenSourceHandle = cancellationTokenSourceHandle;
}
