using Google.Protobuf;

namespace Proton.Sdk.CExports;

public struct ResultExtensions
{
    internal static Result<InteropArray, InteropArray> Success()
    {
        return new Result<InteropArray, InteropArray>(value: InteropArray.Null);
    }

    internal static Result<InteropArray, InteropArray> Success(IMessage data)
    {
        return new Result<InteropArray, InteropArray>(
            value: InteropArray.FromMemory(data.ToByteArray()));
    }

    internal static Result<InteropArray, InteropArray> Success(int value)
    {
        return new Result<InteropArray, InteropArray>(
            value: InteropArray.FromMemory(new IntResponse { Value = value }.ToByteArray()));
    }

    internal static Result<InteropArray, InteropArray> Success(string value)
    {
        return new Result<InteropArray, InteropArray>(
            value: InteropArray.FromMemory(new StringResponse { Value = value }.ToByteArray()));
    }

    internal static Result<InteropArray, InteropArray> Failure(Exception exception, int defaultCode)
    {
        if (exception is ProtonApiException protonApiException)
        {
            return Failure((int)protonApiException.Code, protonApiException.Message);
        }

        return Failure(defaultCode, exception.Message);
    }

    internal static Result<InteropArray, InteropArray> Failure(Exception exception, Action<Error, Exception> setDomainAndCodesFunction)
    {
        var error = exception.ToInteropError(setDomainAndCodesFunction);

        return new Result<InteropArray, InteropArray>(error: InteropArray.FromMemory(error.ToByteArray()));
    }

    private static Result<InteropArray, InteropArray> Failure(int code, string message)
    {
        return new Result<InteropArray, InteropArray>(
            error: InteropArray.FromMemory(new Error { PrimaryCode = code, Message = message }.ToByteArray()));
    }
}
