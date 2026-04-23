namespace Proton.Sdk.CExports;

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
            Type = GetTypeName(exception.GetType()),
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

    private static string GetTypeName(Type type)
    {
        if (!type.IsGenericType)
        {
            return type.FullName ?? $"{nameof(System)}.{nameof(Exception)}";
        }

        var baseName = type.GetGenericTypeDefinition().FullName!;
        baseName = baseName[..baseName.IndexOf('`')];
        var argNames = type.GetGenericArguments().Select(GetTypeName);
        return baseName + "[" + string.Join(",", argNames) + "]";
    }
}
