namespace Proton.Drive.Sdk.CExports;

internal static class ExceptionExtensions
{
    public static Error ToProtoError(this Exception exception, Action<Error, Exception> setDomainAndCodesFunction)
    {
        if (exception is InteropErrorException { Error: not null } interopErrorException)
        {
            return interopErrorException.Error;
        }

        var error = new Error
        {
            Type = GetFriendlyTypeName(exception.GetType()),
            Message = exception.Message,
        };

        var context = exception.StackTrace;
        if (context is not null)
        {
            error.Context = context;
        }

        setDomainAndCodesFunction.Invoke(error, exception);

        error.InnerError = exception.InnerException?.ToProtoError(setDomainAndCodesFunction);

        return error;
    }

    private static string GetFriendlyTypeName(Type type)
    {
        if (!type.IsGenericType)
        {
            return type.Name;
        }

        var baseName = type.Name[..type.Name.IndexOf('`')];
        var argNames = type.GetGenericArguments().Select(GetFriendlyTypeName);
        return $"{baseName}<{string.Join(",", argNames)}>";
    }
}
