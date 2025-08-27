using System.Diagnostics.CodeAnalysis;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Microsoft.Extensions.Logging;

namespace Proton.Sdk.CExports.Logging;

internal sealed unsafe class InteropLoggerProvider(void* callerState, InteropValueCallback<InteropArray<byte>> logCallback) : ILoggerProvider
{
    private readonly void* _callerState = callerState;
    private readonly InteropValueCallback<InteropArray<byte>> _logCallback = logCallback;

    public ILogger CreateLogger(string categoryName)
    {
        return new InteropLogger(_callerState, _logCallback, categoryName);
    }

    public void Dispose()
    {
        // Nothing to do
    }

    internal static bool TryGetFromHandle(nint handle, [MaybeNullWhen(false)] out InteropLoggerProvider session)
    {
        if (handle == 0)
        {
            session = null;
            return false;
        }

        var gcHandle = GCHandle.FromIntPtr(handle);

        session = gcHandle.Target as InteropLoggerProvider;

        return session is not null;
    }

    [UnmanagedCallersOnly(EntryPoint = "logger_provider_create", CallConvs = [typeof(CallConvCdecl)])]
    private static int InitializeLoggerProvider(void* callerState, InteropValueCallback<InteropArray<byte>> logCallback, nint* loggerProviderHandle)
    {
        try
        {
            var provider = new InteropLoggerProvider(callerState, logCallback);
            *loggerProviderHandle = GCHandle.ToIntPtr(GCHandle.Alloc(provider));
            return 0;
        }
        catch
        {
            return -1;
        }
    }
}
