using System.Runtime.InteropServices;

namespace Proton.Sdk.CExports;

[StructLayout(LayoutKind.Sequential)]
internal readonly unsafe struct InteropAsyncVoidCallback
{
    public readonly delegate* unmanaged[Cdecl]<void*, void> OnSuccess;
    public readonly delegate* unmanaged[Cdecl]<void*, InteropArray<byte>, void> OnFailure;
    public readonly nint CancellationTokenSourceHandle;
}
