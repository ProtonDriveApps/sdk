using System.Diagnostics.CodeAnalysis;

namespace Proton.Sdk.Threading;

internal static class ReferenceResultTaskExtensions
{
    public static bool TryGetResult<T>(this Task<T> task, [MaybeNullWhen(false)] out T result)
        where T : class
    {
        if (!task.IsCompletedSuccessfully)
        {
            result = null;
            return false;
        }

        result = task.Result;
        return true;
    }

    public static bool TryGetResult<T>(this ValueTask<T> task, [MaybeNullWhen(false)] out T result)
        where T : class
    {
        if (!task.IsCompletedSuccessfully)
        {
            result = null;
            return false;
        }

        result = task.Result;
        return true;
    }

    public static T? GetResultIfCompletedSuccessfully<T>(this Task<T> task)
        where T : class
    {
        return task.TryGetResult(out var result) ? result : null;
    }

    public static T? GetResultIfCompletedSuccessfully<T>(this ValueTask<T> task)
        where T : class
    {
        return task.TryGetResult(out var result) ? result : null;
    }
}
