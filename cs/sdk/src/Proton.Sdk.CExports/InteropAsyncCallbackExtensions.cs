namespace Proton.Sdk.CExports;

internal static class InteropAsyncCallbackExtensions
{
    public static unsafe int InvokeFor<TResult>(
        this InteropAsyncValueCallback<TResult> callback,
        void* callerState,
        Func<CancellationToken, ValueTask<Result<TResult, InteropArray<byte>>>> asyncFunction)
        where TResult : unmanaged
    {
        if (!InteropCancellationTokenSource.TryGetTokenFromHandle(callback.CancellationTokenSourceHandle, out var cancellationToken))
        {
            return -1;
        }

        Use(
            value => callback.OnSuccess(callerState, value),
            error => callback.OnFailure(callerState, error),
            asyncFunction,
            cancellationToken).RunInBackground();

        return 0;
    }

    public static unsafe int InvokeFor(
        this InteropAsyncVoidCallback callback,
        void* callerState,
        Func<CancellationToken, ValueTask<Result<InteropArray<byte>>>> asyncFunction)
    {
        if (!InteropCancellationTokenSource.TryGetTokenFromHandle(callback.CancellationTokenSourceHandle, out var cancellationToken))
        {
            return -1;
        }

        Use(
            () => callback.OnSuccess(callerState),
            error => callback.OnFailure(callerState, error),
            asyncFunction,
            cancellationToken).RunInBackground();

        return 0;
    }

    private static async ValueTask Use<T>(
        Action<T> onSuccess,
        Action<InteropArray<byte>> onFailure,
        Func<CancellationToken, ValueTask<Result<T, InteropArray<byte>>>> asyncFunction,
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

    private static async ValueTask Use(
        Action onSuccess,
        Action<InteropArray<byte>> onFailure,
        Func<CancellationToken, ValueTask<Result<InteropArray<byte>>>> asyncFunction,
        CancellationToken cancellationToken)
    {
        try
        {
            var result = await asyncFunction.Invoke(cancellationToken).ConfigureAwait(false);

            if (result.TryGetError(out var error))
            {
                onFailure(error);
                return;
            }

            onSuccess();
        }
        catch
        {
            // TODO: log
        }
    }
}
