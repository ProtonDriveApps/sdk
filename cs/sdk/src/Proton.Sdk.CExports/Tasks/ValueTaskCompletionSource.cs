using System.Runtime.CompilerServices;
using System.Threading.Tasks.Sources;

namespace Proton.Sdk.CExports.Tasks;

internal sealed class ValueTaskCompletionSource : IValueTaskSource, IValueTaskCompletionSource
{
    private ManualResetValueTaskSourceCore<object?> _core;

    public ValueTaskCompletionSource()
    {
        _core.RunContinuationsAsynchronously = true;
    }

    public ValueTask Task
    {
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        get => new(this, _core.Version);
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public void SetResult()
    {
        _core.SetResult(null);
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    public void SetException(Exception error)
    {
        _core.SetException(error);
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    void IValueTaskSource.GetResult(short token)
    {
        _core.GetResult(token);
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    ValueTaskSourceStatus IValueTaskSource.GetStatus(short token)
    {
        return _core.GetStatus(token);
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    void IValueTaskSource.OnCompleted(Action<object?> continuation, object? state, short token, ValueTaskSourceOnCompletedFlags flags)
    {
        _core.OnCompleted(continuation, state, token, flags);
    }
}
