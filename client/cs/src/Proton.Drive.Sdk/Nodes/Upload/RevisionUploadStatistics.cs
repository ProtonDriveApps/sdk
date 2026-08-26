namespace Proton.Drive.Sdk.Nodes.Upload;

internal readonly record struct RevisionUploadStatistics(
    bool IsSmallUpload,
    long EncryptedContentSize,
    int ContentBlockCount);
