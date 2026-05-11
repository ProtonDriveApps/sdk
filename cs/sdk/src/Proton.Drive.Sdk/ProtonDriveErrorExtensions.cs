namespace Proton.Drive.Sdk;

public static class ProtonDriveErrorExtensions
{
    // TODO: Find a way to share the share this logic with ExceptionExtensions.FlattenMessage
    public static string FlattenMessage(this ProtonDriveError error)
    {
        var previousMessage = string.Empty;

        return string.Join(
            " → ",
            EnumerateErrorHierarchy(error)
                .Select(e => e.Message)
                .OfType<string>()
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

    private static IEnumerable<ProtonDriveError> EnumerateErrorHierarchy(ProtonDriveError error)
    {
        for (var e = error; e != null; e = e.InnerError)
        {
            yield return e;
        }
    }
}
