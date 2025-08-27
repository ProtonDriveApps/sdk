using System.Runtime.InteropServices;

namespace Proton.Sdk.CExports;

[StructLayout(LayoutKind.Sequential)]
internal readonly unsafe struct InteropAsyncVoidCallback(
    delegate* unmanaged[Cdecl]<void*, void> onSuccess,
    delegate* unmanaged[Cdecl]<void*, InteropArray<byte>, void> onFailure,
    nint cancellationTokenSourceHandle)
{
    public readonly delegate* unmanaged[Cdecl]<void*, void> OnSuccess = onSuccess;
    public readonly delegate* unmanaged[Cdecl]<void*, InteropArray<byte>, void> OnFailure = onFailure;
    public readonly nint CancellationTokenSourceHandle = cancellationTokenSourceHandle;
}
