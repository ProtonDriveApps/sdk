using System.Diagnostics.CodeAnalysis;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Microsoft.Extensions.Logging;

namespace Proton.Sdk.CExports.Logging;

internal sealed class InteropLoggerProvider(InteropLogCallback logCallback) : ILoggerProvider
{
    private readonly InteropLogCallback _logCallback = logCallback;

    public ILogger CreateLogger(string categoryName)
    {
        return new InteropLogger(_logCallback, categoryName);
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
    private static unsafe int InitializeLoggerProvider(InteropLogCallback logCallback, nint* loggerProviderHandle)
    {
        try
        {
            var provider = new InteropLoggerProvider(logCallback);
            *loggerProviderHandle = GCHandle.ToIntPtr(GCHandle.Alloc(provider));
            return 0;
        }
        catch
        {
            return -1;
        }
    }
}
