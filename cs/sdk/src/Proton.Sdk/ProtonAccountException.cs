namespace Proton.Sdk;

public class ProtonAccountException : Exception
{
    public ProtonAccountException()
    {
    }

    public ProtonAccountException(string? message)
        : base(message)
    {
    }

    public ProtonAccountException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
