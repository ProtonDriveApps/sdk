using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text.Json;
using Polly.Timeout;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.CExports;

internal static class InteropErrorConverter
{
    private enum FileSystemErrorCode : long
    {
        Unknown = 0,
        OutOfSpace = 1,
        PermissionDenied = 2,
        NotFound = 3,
    }

    public static void SetDomainAndCodes(Error error, Exception exception)
    {
        switch (exception)
        {
            case OperationCanceledException:
                error.Domain = ErrorDomain.SuccessfulCancellation;
                break;

            case ProtonApiException ex:
                error.Domain = ErrorDomain.Api;
                error.PrimaryCode = ex.Code;
                if (ex.TransportCode is not null)
                {
                    error.SecondaryCode = ex.TransportCode.Value;
                }

                break;

            case SocketException ex:
                error.Domain = ErrorDomain.Network;
                error.PrimaryCode = ex.ErrorCode;
                error.SecondaryCode = (long)ex.SocketErrorCode;
                break;

            case HttpRequestException ex:
                error.Domain = ErrorDomain.Transport;
                error.PrimaryCode = (long)ex.HttpRequestError;
                error.SecondaryCode = ex.StatusCode is not null ? (long)ex.StatusCode : 0;
                break;

            case TimeoutException or TimeoutRejectedException:
                error.Domain = ErrorDomain.Transport;
                error.PrimaryCode = (long)HttpRequestError.ConnectionError;
                break;

            case HttpIOException ex:
                error.Domain = ErrorDomain.Transport;
                error.PrimaryCode = (long)ex.HttpRequestError;
                break;

            case UnauthorizedAccessException:
                error.Domain = ErrorDomain.FileSystem;
                error.PrimaryCode = (long)FileSystemErrorCode.PermissionDenied;
                error.SecondaryCode = exception.HResult;
                break;

            case IOException ex:
                if (GetFileSystemErrorCode(ex) is { } fileSystemErrorCode)
                {
                    error.Domain = ErrorDomain.FileSystem;
                    error.PrimaryCode = (long)fileSystemErrorCode;
                }
                else
                {
                    error.Domain = ErrorDomain.UnknownIo;
                }

                error.SecondaryCode = ex.HResult;
                break;

            case JsonException:
                error.Domain = ErrorDomain.Serialization;
                break;

            case CryptographicException:
                error.Domain = ErrorDomain.Cryptography;
                break;

            default:
                error.Domain = ErrorDomain.Undefined;
                break;
        }
    }

    private static FileSystemErrorCode? GetFileSystemErrorCode(IOException exception)
    {
        // Win32 error code lives in the low word of HResult (Unix runtime maps errno onto it).
        if (exception is FileNotFoundException or DirectoryNotFoundException)
        {
            return FileSystemErrorCode.NotFound;
        }

        return (exception.HResult & 0xFFFF) switch
        {
            0x27 or 0x70 => FileSystemErrorCode.OutOfSpace,     // ERROR_HANDLE_DISK_FULL / ERROR_DISK_FULL
            0x05 => FileSystemErrorCode.PermissionDenied,       // ERROR_ACCESS_DENIED
            0x02 or 0x03 => FileSystemErrorCode.NotFound,       // ERROR_FILE_NOT_FOUND / ERROR_PATH_NOT_FOUND
            _ => null,
        };
    }
}
