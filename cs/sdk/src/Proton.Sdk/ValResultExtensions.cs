using System.Diagnostics.CodeAnalysis;
using System.Runtime.CompilerServices;

namespace Proton.Sdk;

public static class ValResultExtensions
{
    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public static T? GetValueOrDefault<T, TError>(this ValResult<T, TError> result, T? defaultValue = null)
        where T : struct
        where TError : class?
    {
        return result.TryGetValueElseError(out var value, out _) ? value : defaultValue;
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public static T GetValueOrThrow<T, TError>(this ValResult<T, TError> result)
        where T : struct
        where TError : class?
    {
        return result.TryGetValueElseError(out var value, out _)
            ? value.Value
            : throw new InvalidOperationException("Cannot get value from failed result");
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public static bool TryGetValue<T, TError>(this ValResult<T, TError> result, [NotNullWhen(true)] out T? value)
        where T : struct
        where TError : class?
    {
        return result.TryGetValueElseError(out value, out _);
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public static TError? GetErrorOrDefault<T, TError>(this ValResult<T, TError> result, TError? defaultError = null)
        where T : struct
        where TError : class?
    {
        return result.TryGetValueElseError(out _, out var error) ? defaultError : error;
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public static bool TryGetError<T, TError>(this ValResult<T, TError> result, [MaybeNullWhen(false)] out TError error)
        where T : struct
        where TError : class?
    {
        return !result.TryGetValueElseError(out _, out error);
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public static TMerged Merge<T, TError, TMerged>(
        this ValResult<T, TError> result,
        Func<T, TMerged> convertValue,
        Func<TError, TMerged> convertError)
        where T : struct
        where TError : class?
    {
        return result.TryGetValueElseError(out var value, out var error) ? convertValue.Invoke(value.Value) : convertError.Invoke(error);
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public static ValResult<TOther, TOtherError> ConvertVal<T, TError, TOther, TOtherError>(
        this ValResult<T, TError> result,
        Func<T, TOther> convertValue,
        Func<TError, TOtherError> convertError)
        where T : struct
        where TError : class?
        where TOther : struct
        where TOtherError : class?
    {
        return result.TryGetValueElseError(out var value, out var error) ? convertValue.Invoke(value.Value) : convertError.Invoke(error);
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public static RefResult<TOther, TOtherError> ConvertRef<T, TError, TOther, TOtherError>(
        this ValResult<T, TError> result,
        Func<T, TOther> convertValue,
        Func<TError, TOtherError> convertError)
        where T : struct
        where TError : class?
        where TOther : class?
        where TOtherError : class?
    {
        return result.TryGetValueElseError(out var value, out var error) ? convertValue.Invoke(value.Value) : convertError.Invoke(error);
    }
}
