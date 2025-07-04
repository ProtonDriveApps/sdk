using System.Runtime.InteropServices;

namespace Proton.Sdk.CExports.Logging;

[StructLayout(LayoutKind.Sequential)]
internal readonly unsafe struct InteropLogCallback
{
    public readonly void* State;
    public readonly delegate* unmanaged[Cdecl]<void*, InteropArray, void> Invoke;
}
