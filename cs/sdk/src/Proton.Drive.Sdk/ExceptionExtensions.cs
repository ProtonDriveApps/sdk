using System.ComponentModel;
using System.Diagnostics.CodeAnalysis;
using System.Net.Sockets;
using System.Runtime.InteropServices;

namespace Proton.Drive.Sdk;

internal static class ExceptionExtensions
{
#pragma warning disable SA1310
    // ReSharper disable InconsistentNaming
    private const int E_FAIL = unchecked((int)0x80004005);
    private const int COR_E_IO = unchecked((int)0x80131620);
    private const int COR_E_SYSTEM = unchecked((int)0x80131501);
    private const int COR_E_EXCEPTION = unchecked((int)0x80131500);

    // ReSharper restore InconsistentNaming
#pragma warning restore SA1310

    private enum ErrorCodeFormat
    {
        Decimal,
        Hexadecimal,
        Adaptive,
    }

    public static string FlattenMessage(this Exception exception)
    {
        var previousMessage = string.Empty;

        return string.Join(
            " → ",
            EnumerateExceptionHierarchy(exception)
                .Select(ex => ex.Message)
                .Where(m =>
                {
                    if (m == previousMessage)
                    {
                        return false;
                    }

                    previousMessage = m;
                    return true;
                }));
    }

    public static string FlattenMessageWithExceptionType(this Exception exception)
    {
        return string.Join(
            " → ",
            EnumerateExceptionHierarchy(exception)
                .Select(GetExceptionTypeAndMessage));
    }

    private static IEnumerable<Exception> EnumerateExceptionHierarchy(Exception outermostException)
    {
        for (var e = outermostException; e != null; e = e.InnerException)
        {
            yield return e;
        }
    }

    private static string GetExceptionTypeAndMessage(Exception exception)
    {
        return $"{GetExceptionType(exception)}: {exception.Message}";
    }

    private static string GetExceptionType(Exception exception)
    {
        var type = exception.GetType();
        var index = type.Name.IndexOf('`');
        var typeName = index <= 0 ? type.Name : type.Name[..index];

        return exception.TryGetRelevantFormattedErrorCode(out var formattedErrorCode)
            ? $"{typeName}({formattedErrorCode})"
            : typeName;
    }

    private static bool TryGetRelevantFormattedErrorCode(this Exception ex, [MaybeNullWhen(false)] out string formattedErrorCode)
    {
        return ex switch
        {
            HttpRequestException httpException
                => httpException.StatusCode != null
                    ? TryFormatEnumValue(httpException.StatusCode.Value, out formattedErrorCode)
                    : TryFormatEnumValue(httpException.HttpRequestError, out formattedErrorCode),

            HttpIOException httpIoException
                => TryFormatEnumValue(httpIoException.HttpRequestError, out formattedErrorCode),

            SocketException socketException
                => TryFormatEnumValue(socketException.SocketErrorCode, out formattedErrorCode),

            Win32Exception win32Exception
                => TryFormatErrorCode(win32Exception.NativeErrorCode, 0, ErrorCodeFormat.Decimal, out formattedErrorCode),

            IOException
                => TryFormatErrorCode(ex.HResult, COR_E_IO, ErrorCodeFormat.Hexadecimal, out formattedErrorCode),

            ExternalException externalException
                => TryFormatErrorCode(externalException.ErrorCode, E_FAIL, ErrorCodeFormat.Adaptive, out formattedErrorCode),

            SystemException
                => TryFormatErrorCode(ex.HResult, COR_E_SYSTEM, ErrorCodeFormat.Hexadecimal, out formattedErrorCode),

            _ => TryFormatErrorCode(ex.HResult, COR_E_EXCEPTION, ErrorCodeFormat.Hexadecimal, out formattedErrorCode),
        };

        static bool TryFormatErrorCode(int errorCode, int errorCodeToIgnore, ErrorCodeFormat format, [MaybeNullWhen(false)] out string formattedErrorCode)
        {
            if (errorCode == errorCodeToIgnore)
            {
                formattedErrorCode = null;
                return false;
            }

            formattedErrorCode = format switch
            {
                ErrorCodeFormat.Decimal => errorCode.ToString(),
                ErrorCodeFormat.Hexadecimal => $"0x{errorCode:X8}",
                _ => IsBetterFormattedAsHex(errorCode) ? $"0x{errorCode:X8}" : errorCode.ToString(),
            };

            return true;
        }

        static bool IsBetterFormattedAsHex(int errorCode)
        {
            // If the first bit is set to 1, it is likely to be the severity bit of an HRESULT which is usually displayed in hex format.
            return (errorCode & 0x80000000) != 0;
        }

        static bool TryFormatEnumValue<T>(T value, [MaybeNullWhen(false)] out string formattedCode)
        where T : struct
        {
            formattedCode = value.ToString();

            return formattedCode is not null;
        }
    }
}
