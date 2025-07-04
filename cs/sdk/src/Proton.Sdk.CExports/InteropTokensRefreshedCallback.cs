using System.Runtime.InteropServices;

namespace Proton.Sdk.CExports;

[StructLayout(LayoutKind.Sequential)]
internal readonly unsafe struct InteropTokensRefreshedCallback
{
    public readonly void* State;
    public readonly delegate* unmanaged[Cdecl]<void*, InteropArray, void> OnTokenRefreshed;
}
