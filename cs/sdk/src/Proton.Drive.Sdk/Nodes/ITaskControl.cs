namespace Proton.Drive.Sdk.Nodes;

internal interface ITaskControl<T> : IDisposable
{
    bool IsPaused { get; }
    Task<T> PauseExceptionSignal { get; }
    void Pause();
    void Resume();
}
