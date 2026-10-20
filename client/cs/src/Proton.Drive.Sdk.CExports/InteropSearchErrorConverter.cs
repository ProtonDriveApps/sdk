using Proton.Drive.Sdk.Search;

namespace Proton.Drive.Sdk.CExports;

internal static class InteropSearchErrorConverter
{
    public static bool TrySetDomainAndCodes(Error error, Exception exception)
    {
        if (exception is not SearchException searchException)
        {
            return false;
        }

        error.Domain = ErrorDomain.BusinessLogic;

        // TODO: avoid the possibility of an empty message
        error.Message = searchException.Error?.FlattenMessage() ?? string.Empty;

        return true;
    }
}
