using System.Diagnostics.CodeAnalysis;

namespace Proton.Sdk.Threading;

internal static class ValueResultTaskExtensions
{
    public static bool TryGetResult<T>(this Task<T> task, [NotNullWhen(true)] out T? result)
        where T : struct
    {
        if (!task.IsCompletedSuccessfully)
        {
            result = null;
            return false;
        }

        result = task.Result;
        return true;
    }

    public static bool TryGetResult<T>(this ValueTask<T> task, [NotNullWhen(true)] out T? result)
        where T : struct
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
        where T : struct
    {
        return task.TryGetResult(out var result) ? result : null;
    }

    public static T? GetResultIfCompletedSuccessfully<T>(this ValueTask<T> task)
        where T : struct
    {
        return task.TryGetResult(out var result) ? result : null;
    }
}
