using Proton.Drive.Sdk.Api.Files;
using Proton.Sdk;

namespace Proton.Drive.Sdk;

public sealed class RevisionDraftConflictException : ProtonDriveException
{
    public RevisionDraftConflictException()
    {
    }

    public RevisionDraftConflictException(string message)
        : base(message)
    {
    }

    public RevisionDraftConflictException(string message, Exception innerException)
        : base(message, innerException)
    {
    }

    internal RevisionDraftConflictException(ProtonApiException<RevisionConflictResponse> innerException)
        : base(innerException.Message, innerException)
    {
    }
}
