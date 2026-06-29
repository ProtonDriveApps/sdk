using System.Runtime.InteropServices;

namespace Proton.Drive.Sdk.CExports;

[StructLayout(LayoutKind.Sequential)]
internal struct InteropMetricEvent
{
    public nint EventName;
    public nint PropertiesJson;
}
