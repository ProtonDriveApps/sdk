namespace Proton.Sdk;

public static class ExceptionExtensions
{
    public static string FlattenMessage(this Exception exception)
    {
        var previousMessage = string.Empty;

        return string.Join(
            " ---> ",
            ThisAndInnerExceptions(exception)
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

    private static IEnumerable<Exception> ThisAndInnerExceptions(Exception? e)
    {
        for (; e != null; e = e.InnerException)
        {
            yield return e;
        }
    }
}
