using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Search.Abstractions;
using ProtonDriveNodeUid = Proton.Drive.Sdk.Nodes.NodeUid;
using SearchNodeUid = Proton.Drive.Sdk.Search.NodeUid;

namespace Proton.Drive.Sdk.Search;

internal static class SearchExceptionMapper
{
    internal static StorageError ToStorageError(Exception exception, SearchIndexStoreOperation operation)
    {
        if (exception is SearchIndexStoreException storeException)
        {
            return operation switch
            {
                SearchIndexStoreOperation.Load => new StorageError.LoadFailed(storeException.Message ?? "Search index load failed."),
                _ => new StorageError.StoreFailed(storeException.Message ?? "Search index store failed."),
            };
        }

        return new StorageError.CallbackFailed(exception.Message);
    }

    internal static DriveSdkClientError ToDriveSdkError(Exception exception)
    {
        if (exception is SearchNodeProviderException providerException)
        {
            if (providerException.InvalidNodeId is { } invalidNodeId)
            {
                return new DriveSdkClientError.InvalidNode(ParseSearchNodeUidOrOpaque(invalidNodeId));
            }

            return new DriveSdkClientError.IterationFailed(providerException.Message ?? "Node iteration failed.");
        }

        if (exception is OperationCanceledException)
        {
            return new DriveSdkClientError.IterationFailed("Node iteration was canceled.");
        }

        return new DriveSdkClientError.IterationFailed(exception.Message);
    }

    internal static ProtonDriveError ToProtonDriveError(DriveSdkClientError error)
        => error switch
        {
            DriveSdkClientError.IterationFailed iterationFailed => new ProtonDriveError(iterationFailed.Field0),
            DriveSdkClientError.InvalidNode invalidNode => new ProtonDriveError(SearchNodeUidMapping.ToWireFormat(invalidNode.Field0)),
            _ => new ProtonDriveError(error.ToString()),
        };

    internal static ProtonDriveError ToProtonDriveError(SearchEngineError error)
        => error switch
        {
            SearchEngineError.Uninitialised => new ProtonDriveError("Search engine is not initialized."),
            SearchEngineError.ReindexRequired => new ProtonDriveError("Search index is incompatible with this version."),
            SearchEngineError.IndexEmpty => new ProtonDriveError("Search index is empty."),
            SearchEngineError.Storage(var storageMessage) => new ProtonDriveError(storageMessage),
            SearchEngineError.Http(var httpMessage) => new ProtonDriveError(httpMessage),
            SearchEngineError.Search(var searchMessage) => new ProtonDriveError(searchMessage),
            SearchEngineError.Callback(var callbackMessage) => new ProtonDriveError(callbackMessage),
            SearchEngineError.Serde => new ProtonDriveError("Search index serialization failed."),
            SearchEngineError.NoEntropySource => new ProtonDriveError("Search engine has no entropy source."),
            SearchEngineError.NoTimeSource => new ProtonDriveError("Search engine has no time source."),
            SearchEngineError.IndexSizeLimit => new ProtonDriveError("Search index reached the configured size limit."),
            _ => new ProtonDriveError(error.ToString()),
        };

    internal static ProtonDriveError ToProtonDriveError(ExtractEngineError error)
        => error switch
        {
            ExtractEngineError.DriveSdkClient(var driveError) => ToProtonDriveError(driveError),
            ExtractEngineError.Http(var httpMessage) => new ProtonDriveError(httpMessage),
            ExtractEngineError.Callback(var callbackMessage) => new ProtonDriveError(callbackMessage),
            ExtractEngineError.Serde => new ProtonDriveError("Search extraction serialization failed."),
            ExtractEngineError.NoTimeSource => new ProtonDriveError("Search extraction has no time source."),
            ExtractEngineError.QueueNotRequested => new ProtonDriveError("Search extraction queue has not been requested yet."),
            _ => new ProtonDriveError(error.ToString()),
        };

    internal static Exception ToProtonDriveException(Exception exception)
    {
        if (exception is SearchException or NodeNotFoundException or ProtonDriveException)
        {
            return exception;
        }

        if (exception is SearchEngineErrorException searchEngineErrorException)
        {
            return ToProtonDriveException(searchEngineErrorException.Error);
        }

        if (exception is ExtractEngineErrorException extractEngineErrorException)
        {
            return ToProtonDriveException(extractEngineErrorException.Error);
        }

        if (exception is OperationCanceledException)
        {
            return exception;
        }

        return new ProtonDriveException(exception.Message, exception);
    }

    private static Exception ToProtonDriveException(SearchEngineError error)
        => new SearchException(ToProtonDriveError(error));

    private static Exception ToProtonDriveException(ExtractEngineError error)
    {
        if (error is ExtractEngineError.DriveSdkClient(DriveSdkClientError.InvalidNode invalidNode)
            && SearchNodeUidMapping.TryParseProtonDriveNodeUid(invalidNode.Field0, out var nodeUid))
        {
            return new NodeNotFoundException(nodeUid, $"Node not found: {SearchNodeUidMapping.ToWireFormat(invalidNode.Field0)}");
        }

        return new SearchException(ToProtonDriveError(error));
    }

    private static SearchNodeUid ParseSearchNodeUidOrOpaque(string invalidNodeId)
    {
        if (ProtonDriveNodeUid.TryParse(invalidNodeId, out var nodeUid))
        {
            return SearchNodeUidMapping.ToSearchNodeUid(nodeUid.Value);
        }

        var separator = invalidNodeId.IndexOf('~', StringComparison.Ordinal);
        return separator < 0
            ? new SearchNodeUid(invalidNodeId, string.Empty)
            : new SearchNodeUid(invalidNodeId[..separator], invalidNodeId[(separator + 1)..]);
    }
}
