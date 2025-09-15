namespace Proton.Sdk.CExports.Tasks;

internal static class TaskExtensions
{
#pragma warning disable RCS1175 // Unused 'this' parameter
    public static void RunInBackground(this ValueTask task)
#pragma warning restore RCS1175 // Unused 'this' parameter
    {
        // Do nothing, let the task run in the background
        // This method is to avoid warnings of non-awaited async methods
    }
}
