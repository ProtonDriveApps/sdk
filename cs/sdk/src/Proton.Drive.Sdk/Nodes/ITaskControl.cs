namespace Proton.Drive.Sdk.Nodes;

internal interface ITaskControl : IDisposable
{
    bool IsPaused { get; }
    bool IsCanceled { get; }
    CancellationToken CancellationToken { get; }
    CancellationToken PauseOrCancellationToken { get; }
    void Pause();
    bool TryResume();
    void AbortPause();
}
