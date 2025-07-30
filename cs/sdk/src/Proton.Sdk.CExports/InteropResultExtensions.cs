using System.Runtime.InteropServices;
using System.Text;
using Google.Protobuf;

namespace Proton.Sdk.CExports;

internal static class InteropResultExtensions
{
    internal static Result<InteropArray<byte>, InteropArray<byte>> Success()
    {
        return new Result<InteropArray<byte>, InteropArray<byte>>(value: InteropArray<byte>.Null);
    }

    internal static Result<InteropArray<byte>, InteropArray<byte>> Success(IMessage data)
    {
        return new Result<InteropArray<byte>, InteropArray<byte>>(
            value: InteropArray<byte>.FromMemory(data.ToByteArray()));
    }

    internal static unsafe Result<InteropArray<byte>, InteropArray<byte>> Success(string value)
    {
        var maxByteCount = Encoding.UTF8.GetMaxByteCount(value.Length);
        var ptr = (byte*)NativeMemory.Alloc((nuint)maxByteCount);

        var length = Encoding.UTF8.GetBytes(value, new Span<byte>(ptr, maxByteCount));

        return Result<InteropArray<byte>, InteropArray<byte>>.Success(new InteropArray<byte>(ptr, length));
    }

    internal static Result<InteropArray<byte>> Failure(Exception exception, int defaultCode)
    {
        if (exception is ProtonApiException protonApiException)
        {
            return Failure((int)protonApiException.Code, protonApiException.Message);
        }

        return Failure(defaultCode, exception.Message);
    }

    internal static Result<TValue, InteropArray<byte>> Failure<TValue>(Exception exception, int defaultCode)
    {
        if (exception is ProtonApiException protonApiException)
        {
            return Failure<TValue>((int)protonApiException.Code, protonApiException.Message);
        }

        return Failure<TValue>(defaultCode, exception.Message);
    }

    internal static Result<InteropArray<byte>> Failure(Exception exception, Action<Error, Exception> setDomainAndCodesFunction)
    {
        var error = exception.ToInteropError(setDomainAndCodesFunction);

        return new Result<InteropArray<byte>>(error: InteropArray<byte>.FromMemory(error.ToByteArray()));
    }

    internal static Result<TValue, InteropArray<byte>> Failure<TValue>(Exception exception, Action<Error, Exception> setDomainAndCodesFunction)
    {
        var error = exception.ToInteropError(setDomainAndCodesFunction);

        return new Result<TValue, InteropArray<byte>>(error: InteropArray<byte>.FromMemory(error.ToByteArray()));
    }

    private static Result<InteropArray<byte>> Failure(int code, string message)
    {
        return new Result<InteropArray<byte>>(
            error: InteropArray<byte>.FromMemory(new Error { PrimaryCode = code, Message = message }.ToByteArray()));
    }

    private static Result<TValue, InteropArray<byte>> Failure<TValue>(int code, string message)
    {
        return new Result<TValue, InteropArray<byte>>(
            error: InteropArray<byte>.FromMemory(new Error { PrimaryCode = code, Message = message }.ToByteArray()));
    }
}
