namespace Proton.Sdk.CExports;

public sealed class InteropErrorException : Exception
{
    public InteropErrorException()
    {
    }

    public InteropErrorException(string message)
        : base(message)
    {
    }

    public InteropErrorException(string message, Exception innerException)
        : base(message, innerException)
    {
    }

    internal InteropErrorException(Error error)
        : base(error.Message)
    {
        Error = error;
    }

    internal Error? Error { get; }
}
