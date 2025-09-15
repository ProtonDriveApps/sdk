using Google.Protobuf;
using Google.Protobuf.WellKnownTypes;
using Microsoft.Extensions.Logging;

namespace Proton.Sdk.CExports.Logging;

internal sealed class InteropLoggerProvider(nint callerState, InteropAction<nint, InteropArray<byte>> logAction) : ILoggerProvider
{
    private readonly nint _callerState = callerState;
    private readonly InteropAction<nint, InteropArray<byte>> _logAction = logAction;

    public ILogger CreateLogger(string categoryName)
    {
        return new InteropLogger(_callerState, _logAction, categoryName);
    }

    public void Dispose()
    {
        // Nothing to do
    }

    public static IMessage HandleCreate(LoggerProviderCreate request, nint callerState)
    {
        var logAction = new InteropAction<nint, InteropArray<byte>>(request.LogAction);

        var provider = new InteropLoggerProvider(callerState, logAction);

        return new Int64Value { Value = Interop.AllocHandle(provider) };
    }
}
