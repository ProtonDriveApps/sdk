namespace Proton.Sdk;

public static class ExceptionExtensions
{
    public static string FlattenMessage(this Exception exception)
    {
        var previousMessage = string.Empty;

        return string.Join(
            " → ",
            EnumerateExceptionHierarchy(exception)
                .Select(ex => ex.Message)
                .Where(m =>
                {
                    if (m == previousMessage)
                    {
                        return false;
                    }

                    previousMessage = m;
                    return true;
                }));
    }

    private static IEnumerable<Exception> EnumerateExceptionHierarchy(Exception outermostException)
    {
        for (var e = outermostException; e != null; e = e.InnerException)
        {
            yield return e;
        }
    }
}
