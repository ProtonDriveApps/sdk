namespace Proton.Sdk.CExports;

internal static class ExceptionExtensions
{
    public static Error ToInteropError(this Exception exception, Action<Error, Exception> setDomainAndCodesFunction)
    {
        var error = new Error
        {
            Message = exception.Message,
        };

        var type = exception.GetType().FullName;
        if (type is not null)
        {
            error.Type = type;
        }

        var context = exception.StackTrace;
        if (context is not null)
        {
            error.Context = context;
        }

        setDomainAndCodesFunction.Invoke(error, exception);

        error.InnerError = exception.InnerException?.ToInteropError(setDomainAndCodesFunction);

        return error;
    }
}
