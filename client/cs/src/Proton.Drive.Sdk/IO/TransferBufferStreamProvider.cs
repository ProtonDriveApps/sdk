using System.Text;
using Microsoft.Win32.SafeHandles;

namespace Proton.Drive.Sdk.IO;

internal static class TransferBufferStreamProvider
{
#if TRANSFER_STORAGE_BUFFER_ENABLED
    private const bool TransferStorageBufferIsEnabled = true;
#else
    private const bool TransferStorageBufferIsEnabled = false;
#endif

    private static readonly Lazy<string> TransferBufferDirectoryPath = new(() =>
    {
        var directory = Directory.CreateTempSubdirectory("proton-drive-transfer-");
        var path = directory.FullName;
        return path.EndsWith(Path.DirectorySeparatorChar)
            ? path
            : path + Path.DirectorySeparatorChar;
    });

#pragma warning disable CS0162 // Unreachable code detected - This is intentional to allow for conditional compilation based on TRANSFER_STORAGE_BUFFER_ENABLED.
    public static Stream GetBufferStream()
    {
        if (!TransferStorageBufferIsEnabled)
        {
            return ProtonDriveClient.MemoryStreamManager.GetStream();
        }

        var fileNameTemplate = "tmp-proton-drive-XXXXXX"u8;
        var tempDirectoryPath = TransferBufferDirectoryPath.Value;

        int fd;
        unsafe
        {
            var pathTemplateBufferLength = Encoding.UTF8.GetByteCount(tempDirectoryPath) + fileNameTemplate.Length + 1;
            var pathTemplate = pathTemplateBufferLength <= 255 ? stackalloc byte[pathTemplateBufferLength] : new byte[pathTemplateBufferLength];
            var fileNameCopyPosition = Encoding.UTF8.GetBytes(tempDirectoryPath, pathTemplate);
            fileNameTemplate.CopyTo(pathTemplate[fileNameCopyPosition..]);
            pathTemplate[^1] = 0;

            fixed (byte* pathTemplatePointer = pathTemplate)
            {
                fd = LibC.mkstemp(pathTemplatePointer);
                if (fd < 0)
                {
                    throw new IOException("Failed to create temporary file");
                }

                if (LibC.unlink(pathTemplatePointer) != 0)
                {
                    throw new IOException("Failed to unlink temporary file");
                }
            }
        }

        var safeHandle = new SafeFileHandle(new nint(fd), ownsHandle: true);

        return new FileStream(safeHandle, FileAccess.ReadWrite, bufferSize: 32768);
    }
#pragma warning restore CS0162 // Unreachable code detected
}
