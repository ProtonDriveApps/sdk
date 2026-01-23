
/// Represents the type of operation, which determines which cleanup function will be called when the operation is disposed.
public enum NodeType: Sendable {
    case file
    case photo
}
