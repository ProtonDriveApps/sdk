namespace Proton.Sdk.CExports;

internal static class ExceptionExtensions
{
    public static Error ToErrorMessage(this Exception exception, Action<Error, Exception> setDomainAndCodesFunction)
    {
        if (exception is InteropErrorException { Error: not null } interopErrorException)
        {
            return interopErrorException.Error;
        }

        var error = new Error
        {
            Type = exception.GetType().FullName ?? $"{nameof(System)}.{nameof(Exception)}",
            Message = exception.Message,
        };

        var context = exception.StackTrace;
        if (context is not null)
        {
            error.Context = context;
        }

        setDomainAndCodesFunction.Invoke(error, exception);

        error.InnerError = exception.InnerException?.ToErrorMessage(setDomainAndCodesFunction);

        return error;
    }
}
