using System.Runtime.InteropServices;

namespace Proton.Drive.Sdk.IO;

internal static unsafe partial class LibC
{
    [LibraryImport("libc")]
#pragma warning disable SA1300 // Element should begin with upper-case letter
    public static partial int mkstemp(byte* template);
#pragma warning restore SA1300 // Element should begin with upper-case letter

    [LibraryImport("libc")]
#pragma warning disable SA1300 // Element should begin with upper-case letter
    public static partial int unlink(byte* pathname);
#pragma warning restore SA1300 // Element should begin with upper-case letter
}
