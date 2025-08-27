using System.Runtime.InteropServices;
using Proton.Sdk.CExports;

namespace Proton.Drive.Sdk.CExports;

[StructLayout(LayoutKind.Sequential)]
internal readonly unsafe struct InteropReadCallback
{
    public readonly delegate* unmanaged[Cdecl]<void*, InteropArray<byte>, nint, InteropAsyncValueCallback<int>, int> Invoke;
}
