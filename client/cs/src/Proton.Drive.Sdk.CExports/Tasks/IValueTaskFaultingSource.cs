namespace Proton.Drive.Sdk.CExports.Tasks;

internal interface IValueTaskFaultingSource
{
    void SetException(Exception error);
}
