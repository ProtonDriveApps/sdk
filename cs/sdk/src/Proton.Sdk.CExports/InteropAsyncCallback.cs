using System.Runtime.InteropServices;

namespace Proton.Sdk.CExports;

[StructLayout(LayoutKind.Sequential)]
internal readonly unsafe struct InteropAsyncCallback
{
    public readonly void* State;
    public readonly delegate* unmanaged[Cdecl]<void*, InteropArray, void> OnSuccess;
    public readonly delegate* unmanaged[Cdecl]<void*, InteropArray, void> OnFailure;
    public readonly nint CancellationTokenSourceHandle;
}
