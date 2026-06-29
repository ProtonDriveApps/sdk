namespace Proton.Drive.Sdk.Nodes.Upload;

internal readonly record struct BlockUploadResult(int PlaintextSize, byte[] Sha256Digest);
