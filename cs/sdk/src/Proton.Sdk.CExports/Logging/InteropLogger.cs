using System.Runtime.InteropServices;
using Google.Protobuf;
using Microsoft.Extensions.Logging;

namespace Proton.Sdk.CExports.Logging;

using EventId = Microsoft.Extensions.Logging.EventId;

[StructLayout(LayoutKind.Sequential)]
internal sealed class InteropLogger(InteropLogCallback logCallback, string categoryName) : ILogger
{
    private readonly InteropLogCallback _logCallback = logCallback;
    private readonly string _categoryName = categoryName;

    public IDisposable BeginScope<TState>(TState state)
        where TState : notnull
    {
        // TODO: add support for scopes?
        return new DummyDisposable();
    }

    public unsafe void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
    {
        var message = formatter.Invoke(state, exception);
        var logEvent = new LogEvent { Level = (int)logLevel, Message = message, CategoryName = _categoryName };

        var messageBytes = InteropArray.FromMemory(logEvent.ToByteArray());

        try
        {
            _logCallback.Invoke(_logCallback.State, messageBytes);
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
