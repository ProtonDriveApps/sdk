using System.Runtime.InteropServices;

namespace Proton.Sdk.CExports;

[StructLayout(LayoutKind.Sequential)]
internal readonly unsafe struct InteropAsyncValueCallback<T>
    where T : unmanaged
{
    public readonly delegate* unmanaged[Cdecl]<void*, T, void> OnSuccess;
    public readonly delegate* unmanaged[Cdecl]<void*, InteropArray<byte>, void> OnFailure;
    public readonly nint CancellationTokenSourceHandle;
}
