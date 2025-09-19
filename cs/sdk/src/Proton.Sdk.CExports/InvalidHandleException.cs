namespace Proton.Sdk.CExports;

public class InvalidHandleException : Exception
{
    public InvalidHandleException()
    {
    }

    public InvalidHandleException(string message)
        : base(message)
    {
    }

    public InvalidHandleException(string message, Exception? innerException)
        : base(message, innerException)
    {
    }

    public static InvalidHandleException Create<T>(nint handle, Exception? innerException = null)
    {
        return new InvalidHandleException($"Invalid handle {handle:x16} for {typeof(T).Name}", innerException);
    }
}
