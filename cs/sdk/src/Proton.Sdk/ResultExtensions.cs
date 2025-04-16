using System.Diagnostics.CodeAnalysis;
using System.Runtime.CompilerServices;

namespace Proton.Sdk;
public static class ResultExtensions
{
    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public static Result<TOther, TOtherError> Convert<T, TError, TOther, TOtherError>(
        this Result<T, TError> result,
        Func<T, TOther> convertValue,
        Func<TError, TOtherError> convertError)
    {
        return result.TryGetValueElseError(out var value, out var error) ? convertValue.Invoke(value) : convertError.Invoke(error);
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public static Result<TOther, TError> Convert<T, TError, TOther>(
        this Result<T, TError> result,
        Func<T, TOther> convertValue)
    {
        return result.TryGetValueElseError(out var value, out var error) ? convertValue.Invoke(value) : error;
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public static Result<T, TOtherError> Convert<T, TError, TOtherError>(
        this Result<T, TError> result,
        Func<TError, TOtherError> convertError)
    {
        return result.TryGetValueElseError(out var value, out var error) ? value : convertError.Invoke(error);
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public static T? GetValueOrDefault<T, TError>(this Result<T, TError> result, T? defaultValue = null)
        where T : class
    {
        return result.TryGetValueElseError(out var value, out _) ? value : defaultValue;
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public static T? GetValueOrDefault<T, TError>(this Result<T, TError> result, T? defaultValue = null)
        where T : struct
    {
        return result.TryGetValueElseError(out var value, out _) ? value : defaultValue;
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public static T GetValueOrThrow<T, TError>(this Result<T, TError> result)
    {
        return result.TryGetValueElseError(out var value, out _) ? value : throw new InvalidOperationException("Cannot get value from failed result");
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public static bool TryGetValue<T, TError>(this Result<T, TError> result, [MaybeNullWhen(false)] out T value)
    {
        return result.TryGetValueElseError(out value, out _);
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public static bool TryGetError<T, TError>(this Result<T, TError> result, [MaybeNullWhen(false)] out TError error)
    {
        return !result.TryGetValueElseError(out _, out error);
    }
}
