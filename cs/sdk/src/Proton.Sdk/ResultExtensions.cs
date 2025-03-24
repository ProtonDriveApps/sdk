namespace Proton.Sdk;

public static class ResultExtensions
{
    public static T? GetValueOrDefault<T, TError>(this Result<T, TError> result, T? defaultValue = default)
    {
        return result.TryGetValue(out var value, out _) ? value : defaultValue;
    }
}
