namespace Proton.Sdk.CExports.Tasks;

internal interface IValueTaskFaultingSource
{
    void SetException(Exception error);
}
