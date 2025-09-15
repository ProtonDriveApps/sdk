using System.Runtime.CompilerServices;
using System.Threading.Tasks.Sources;

namespace Proton.Sdk.CExports.Tasks;

internal sealed class ValueTaskCompletionSource<T> : IValueTaskSource<T>, IValueTaskCompletionSource<T>
{
    private ManualResetValueTaskSourceCore<T> _core;

    public ValueTaskCompletionSource()
    {
        _core.RunContinuationsAsynchronously = true;
    }

    public ValueTask<T> Task
    {
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        get => new(this, _core.Version);
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public void SetResult(T result)
    {
        _core.SetResult(result);
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public void SetException(Exception error)
    {
        _core.SetException(error);
    }

    T IValueTaskSource<T>.GetResult(short token)
    {
        return _core.GetResult(token);
    }

    ValueTaskSourceStatus IValueTaskSource<T>.GetStatus(short token)
    {
        return _core.GetStatus(token);
    }

    void IValueTaskSource<T>.OnCompleted(Action<object?> continuation, object? state, short token, ValueTaskSourceOnCompletedFlags flags)
    {
        _core.OnCompleted(continuation, state, token, flags);
    }
}
