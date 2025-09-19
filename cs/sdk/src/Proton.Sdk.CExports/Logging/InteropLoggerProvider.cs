using Google.Protobuf;
using Google.Protobuf.WellKnownTypes;
using Microsoft.Extensions.Logging;

namespace Proton.Sdk.CExports.Logging;

internal sealed unsafe class InteropLoggerProvider(nint callerState, delegate* unmanaged[Cdecl]<nint, InteropArray<byte>, void> logCallback) : ILoggerProvider
{
    private readonly nint _callerState = callerState;
    private readonly delegate* unmanaged[Cdecl]<nint, InteropArray<byte>, void> _logCallback = logCallback;

    public ILogger CreateLogger(string categoryName)
    {
        return new InteropLogger(_callerState, _logCallback, categoryName);
    }

    public void Dispose()
    {
        // Nothing to do
    }

    public static IMessage HandleCreate(LoggerProviderCreate request, nint callerState)
    {
        var provider = new InteropLoggerProvider(callerState, (delegate* unmanaged[Cdecl]<nint, InteropArray<byte>, void>)request.LogCallback);

        return new Int64Value { Value = Interop.AllocHandle(provider) };
    }
}
