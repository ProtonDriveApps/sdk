using System.Runtime.InteropServices;

namespace Proton.Sdk.CExports;

[StructLayout(LayoutKind.Sequential)]
internal struct InteropMetricEvent
{
    public nint EventName;
    public nint PropertiesJson;
}
