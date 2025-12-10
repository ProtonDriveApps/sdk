using System.Runtime.InteropServices;
using Google.Protobuf;
using Microsoft.Extensions.Logging;

namespace Proton.Sdk.CExports.Logging;

[StructLayout(LayoutKind.Sequential)]
internal sealed class InteropLogger(nint bindingsHandle, InteropAction<nint, InteropArray<byte>> logAction, string categoryName) : ILogger
{
    private readonly nint _bindingsHandle = bindingsHandle;
    private readonly InteropAction<nint, InteropArray<byte>> _logAction = logAction;
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
        if (exception != null)
        {
            message = message + Environment.NewLine + exception.ToString();
        }
        var logEvent = new LogEvent { Level = (int)logLevel, Message = message, CategoryName = _categoryName };

        var messageBytes = logEvent.ToByteArray();

        fixed (byte* messagePointer = messageBytes)
        {
            _logAction.Invoke(_bindingsHandle, new InteropArray<byte>(messagePointer, messageBytes.Length));
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
