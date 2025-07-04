namespace Proton.Sdk.CExports;

internal static class InteropAsyncCallbackExtensions
{
    public static unsafe int InvokeFor(this InteropAsyncCallback callback, Func<CancellationToken, ValueTask<Result<InteropArray, InteropArray>>> asyncFunction)
    {
        if (!InteropCancellationTokenSource.TryGetTokenFromHandle(callback.CancellationTokenSourceHandle, out var cancellationToken))
        {
            return -1;
        }

        Use(
            value => callback.OnSuccess(callback.State, value),
            error => callback.OnFailure(callback.State, error),
            asyncFunction,
            cancellationToken);

        return 0;
    }

    private static async void Use<T>(
        Action<T> onSuccess,
        Action<T> onFailure,
        Func<CancellationToken, ValueTask<Result<T, T>>> asyncFunction,
        CancellationToken cancellationToken)
    {
        try
        {
            var result = await asyncFunction.Invoke(cancellationToken).ConfigureAwait(false);

            if (!result.TryGetValueElseError(out var value, out var error))
            {
                onFailure(error);
                return;
            }

            onSuccess(value);
        }
        catch
        {
            // TODO: log
        }
    }
}
