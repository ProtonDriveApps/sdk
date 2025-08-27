using System.Runtime.InteropServices;
using Proton.Sdk.CExports;

namespace Proton.Drive.Sdk.CExports;

[StructLayout(LayoutKind.Sequential)]
internal readonly unsafe struct InteropWriteCallback
{
    public readonly delegate* unmanaged[Cdecl]<void*, InteropArray<byte>, nint, InteropAsyncVoidCallback, void> Invoke;
}
