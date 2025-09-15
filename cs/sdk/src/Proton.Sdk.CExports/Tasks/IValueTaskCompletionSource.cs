namespace Proton.Sdk.CExports.Tasks;

internal interface IValueTaskCompletionSource<T> : IValueTaskFaultingSource
{
    ValueTask<T> Task { get; }

    void SetResult(T result);
}

internal interface IValueTaskCompletionSource : IValueTaskFaultingSource
{
    ValueTask Task { get; }

    void SetResult();
}
