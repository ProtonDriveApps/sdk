namespace Proton.Drive.Sdk.Nodes;

internal static class NodeOperationDataExtensions
{
    extension(NodeOperationData nodeOperationData)
    {
        public bool NodeWasSignedAnonymously() => nodeOperationData.PassphraseForAnonymousMove is { Length: > 0 };
    }
}
