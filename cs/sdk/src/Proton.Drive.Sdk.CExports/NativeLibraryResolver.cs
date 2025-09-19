using System.Collections.Concurrent;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Runtime.Loader;
using System.Text;
using Proton.Sdk.CExports;

namespace Proton.Drive.Sdk.CExports;

public static class NativeLibraryResolver
{
    private static readonly ConcurrentDictionary<string, string> LibraryNameMap = new();

    [UnmanagedCallersOnly(EntryPoint = "override_native_library_name", CallConvs = [typeof(CallConvCdecl)])]
    private static void OverrideNativeLibraryName(InteropArray<byte> libraryNameBytes, InteropArray<byte> overridingLibraryNameBytes)
    {
        var libraryName = Encoding.UTF8.GetString(libraryNameBytes.AsReadOnlySpan());
        var overridingLibraryName = Encoding.UTF8.GetString(overridingLibraryNameBytes.AsReadOnlySpan());

        LibraryNameMap[libraryName] = overridingLibraryName;

        AssemblyLoadContext.Default.ResolvingUnmanagedDll += Resolve;
    }

    private static nint Resolve(Assembly assembly, string libraryName)
    {
        if (LibraryNameMap.TryGetValue(libraryName, out var overridingLibraryName))
        {
            libraryName = overridingLibraryName;
        }

        return NativeLibrary.Load(libraryName, assembly, null);
    }
}
