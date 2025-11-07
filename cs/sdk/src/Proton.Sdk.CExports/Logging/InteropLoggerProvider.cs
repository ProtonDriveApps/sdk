using Google.Protobuf;
using Google.Protobuf.WellKnownTypes;
using Microsoft.Extensions.Logging;

namespace Proton.Sdk.CExports.Logging;

internal sealed class InteropLoggerProvider(nint bindingsHandle, InteropAction<nint, InteropArray<byte>> logAction) : ILoggerProvider
{
    private readonly nint _bindingsHandle = bindingsHandle;
    private readonly InteropAction<nint, InteropArray<byte>> _logAction = logAction;

    public static IMessage HandleCreate(LoggerProviderCreate request, nint bindingsHandle)
    {
        var logAction = new InteropAction<nint, InteropArray<byte>>(request.LogAction);

        var provider = new InteropLoggerProvider(bindingsHandle, logAction);

        return new Int64Value { Value = Interop.AllocHandle(provider) };
    }

    public ILogger CreateLogger(string categoryName)
    {
        return new InteropLogger(_bindingsHandle, _logAction, categoryName);
    }

    public void Dispose()
    {
        // Nothing to do
    }
}
