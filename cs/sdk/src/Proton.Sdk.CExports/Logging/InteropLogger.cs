using System.Runtime.InteropServices;
using Google.Protobuf;
using Microsoft.Extensions.Logging;

namespace Proton.Sdk.CExports.Logging;

[StructLayout(LayoutKind.Sequential)]
internal sealed class InteropLogger(nint callerState, InteropAction<nint, InteropArray<byte>> logAction, string categoryName) : ILogger
{
    private readonly nint _callerState = callerState;
    private readonly InteropAction<nint, InteropArray<byte>> _logAction = logAction;
    private readonly string _categoryName = categoryName;

    public IDisposable BeginScope<TState>(TState state)
        where TState : notnull
    {
        // TODO: add support for scopes?
        return new DummyDisposable();
    }

    public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
    {
        var message = formatter.Invoke(state, exception);
        var logEvent = new LogEvent { Level = (int)logLevel, Message = message, CategoryName = _categoryName };

        var messageBytes = InteropArray<byte>.AllocFromMemory(logEvent.ToByteArray());

        try
        {
            _logAction.Invoke(_callerState, messageBytes);
        }
        finally
        {
            messageBytes.Free();
        }
    }

    public bool IsEnabled(LogLevel logLevel)
    {
        return true;
    }

    private sealed class DummyDisposable : IDisposable
    {
        public void Dispose()
        {
            // do nothing intentionally
        }
    }
}
