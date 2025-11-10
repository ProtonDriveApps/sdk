import Foundation

// MARK: - Swift Types (hiding protobuf implementation)

public struct ProtonDriveSDKError: LocalizedError, Sendable {
    
    public enum Domain: Sendable {
        // SDK domains
        case undefined
        case successfulCancellation
        case api
        case network
        case transport
        case serialization
        case cryptography
        case dataIntegrity
        
        // Interop domains
        case interop
        
        init(interopErrorDomain: Proton_Sdk_ErrorDomain) {
            switch interopErrorDomain {
            case .undefined: self = .undefined
            case .successfulCancellation: self = .successfulCancellation
            case .api: self = .api
            case .network: self = .network
            case .transport: self = .transport
            case .serialization: self = .serialization
            case .cryptography: self = .cryptography
            case .dataIntegrity: self = .dataIntegrity
            case .UNRECOGNIZED(let int):
                assertionFailure("Received unexpected error domain value \(int)")
                self = .undefined
            }
        }
    }
    
    public enum InteropErrorTypes: Sendable {
        case wrongProto(message: String)
        case wrongSDKResponse(message: String)
        case wrongResult(message: String)
        
        var typeName: String {
            switch self {
            case .wrongProto: return "WrongProtoMessageType"
            case .wrongSDKResponse: return "WrongSDKResponseType"
            case .wrongResult: return "WrongSDKRequestResult"
            }
        }
        
        var message: String {
            switch self {
            case .wrongProto(let message): return message
            case .wrongSDKResponse(let message): return message
            case .wrongResult(let message): return message
            }
        }
    }
    
    // Helper to break type recursion
    private final class InnerErrorBox: Sendable {
        let innerError: ProtonDriveSDKError
        init(protoError: Proton_Sdk_Error) {
            self.innerError = ProtonDriveSDKError(protoError: protoError)
        }
    }
    
    public var errorDescription: String? { message }
    
    public let type: String
    public let message: String
    public let domain: Domain
    public let primaryCode: Int?
    public let secondaryCode: Int?
    public let context: String?
    public var innerError: ProtonDriveSDKError? { innerErrorBox?.innerError }
    
    private let innerErrorBox: InnerErrorBox?
    
    init(protoError: Proton_Sdk_Error) {
        if !(protoError.hasMessage && protoError.hasType && protoError.hasDomain) {
            assertionFailure("Type, message, and domain are non-optional in Proton_Sdk_Error proto")
        }
        self.type = protoError.hasType ? protoError.type : ""
        self.message = protoError.hasMessage ? protoError.message : ""
        self.domain = protoError.hasDomain ? Domain(interopErrorDomain: protoError.domain) : .undefined
        self.primaryCode = protoError.hasPrimaryCode ? Int(protoError.primaryCode) : nil
        self.secondaryCode = protoError.hasSecondaryCode ? Int(protoError.secondaryCode) : nil
        self.context = protoError.hasContext ? protoError.context : nil
        self.innerErrorBox = protoError.hasInnerError ? InnerErrorBox(protoError: protoError.innerError) : nil
    }
    
    init(interopError: InteropErrorTypes) {
        self.type = interopError.typeName
        self.message = interopError.message
        self.domain = .interop
        self.primaryCode = nil
        self.secondaryCode = nil
        self.context = nil
        self.innerErrorBox = nil
    }
}

// MARK: — Helpers for data integrity errors

public extension ProtonDriveSDKError {

    var asDataIntegrityError: ProtonDriveSDKDataIntegrityError? {
        guard domain == .dataIntegrity, let primaryCode else { return nil }
        // taken from dotNET code
        let unknownDecryptionErrorPrimaryCode = 0
        let shareMetadataDecryptionErrorPrimaryCode = 1
        let nodeMetadataDecryptionErrorPrimaryCode = 2
        let fileContentsDecryptionErrorPrimaryCode = 3
        let uploadKeyMismatchErrorPrimaryCode = 4
        switch primaryCode {
        case shareMetadataDecryptionErrorPrimaryCode:
            return .shareMetadata(message: message, context: context)
        case nodeMetadataDecryptionErrorPrimaryCode:
            return .nodeMetadata(message: message,
                                 part: secondaryCode.flatMap(ProtonDriveSDKDataIntegrityError.NodeMetadataPart.init),
                                 context: context)
        case fileContentsDecryptionErrorPrimaryCode:
            return .fileContents(message: message, context: context)
        case uploadKeyMismatchErrorPrimaryCode:
            return .uploadKeyMismatch(message: message, context: context)
        case unknownDecryptionErrorPrimaryCode:
            return .unknown(message: message, context: context)
        default:
            return .unknown(message: message, context: context)
        }
    }
    var underlyingDataIntegrityError: ProtonDriveSDKDataIntegrityError? {
        guard let dataIntegrityError = asDataIntegrityError else { return innerError?.underlyingDataIntegrityError }
        return dataIntegrityError
    }
}

public enum ProtonDriveSDKDataIntegrityError: LocalizedError {
    case unknown(message: String, context: String?)
    case shareMetadata(message: String, context: String?)
    case nodeMetadata(message: String, part: NodeMetadataPart?, context: String?)
    case fileContents(message: String, context: String?)
    case uploadKeyMismatch(message: String, context: String?)

    public enum NodeMetadataPart: Int, Sendable {
        case key = 0
        case passphrase = 1
        case name = 2
        case extendedAttributes = 3
        case contentKey = 4
        case hashKey = 5
        case blockSignature = 6
        case thumbnail = 7
    }
}

// MARK: - Helpers for handling the network errors

public extension ProtonDriveSDKError {

    var asAPINetworkError: ProtonDriveSDKAPINetworkError? {
        guard domain == .api, let primaryCode else { return nil }
        return ProtonDriveSDKAPINetworkError(
            message: message, domainCode: primaryCode, httpCode: secondaryCode, context: context
        )
    }
    
    var asHTTPNetworkError: ProtonDriveSDKHTTPNetworkError? {
        guard domain == .transport,
              let primaryCode,
              let errorType = ProtonDriveSDKHTTPNetworkError.HttpErrorType(rawValue: primaryCode)
        else { return nil }
        return ProtonDriveSDKHTTPNetworkError(
            message: message, errorType: errorType, httpCode: secondaryCode, context: context
        )
    }
    
    var asSocketNetworkError: ProtonDriveSDKSocketNetworkError? {
        guard domain == .network,
              let primaryCode,
              let secondaryCode,
              let errorType = ProtonDriveSDKSocketNetworkError.SocketErrorType(rawValue: secondaryCode)
        else { return nil }
        return ProtonDriveSDKSocketNetworkError(
            message: message, errorCode: primaryCode, errorType: errorType, context: context
        )
    }
    
    var underlyingAPINetworkError: ProtonDriveSDKAPINetworkError? {
        guard let apiNetworkError = asAPINetworkError else { return innerError?.underlyingAPINetworkError }
        return apiNetworkError
    }
    
    var underlyingHTTPNetworkError: ProtonDriveSDKHTTPNetworkError? {
        guard let httpNetworkError = asHTTPNetworkError else { return innerError?.underlyingHTTPNetworkError }
        return httpNetworkError
    }
    
    var underlyingSocketNetworkError: ProtonDriveSDKSocketNetworkError? {
        guard let socketNetworkError = asSocketNetworkError else { return innerError?.underlyingSocketNetworkError }
        return socketNetworkError
    }
}


public struct ProtonDriveSDKAPINetworkError: LocalizedError, Sendable {
    public let message: String
    public let domainCode: Int
    public let httpCode: Int?
    public let context: String?
    
    public var errorDescription: String? { message }
}

public struct ProtonDriveSDKHTTPNetworkError: LocalizedError, Sendable {
    // the comments and values for the cases were taken from dotNET
    public enum HttpErrorType: Int, Sendable {
        /// A generic or unknown error occurred.
        case unknown = 0
        /// The DNS name resolution failed.
        case nameResolutionError = 1
        /// A transport-level failure occurred while connecting to the remote endpoint.
        case connectionError = 2
        /// An error occurred during the TLS handshake.
        case secureConnectionError = 3
        /// An HTTP/2 or HTTP/3 protocol error occurred.
        case httpProtocolError = 4
        /// Extended CONNECT for WebSockets over HTTP/2 is not supported by the peer.
        case extendedConnectNotSupported = 5
        /// Cannot negotiate the HTTP version requested.
        case versionNegotiationError = 6
        /// The authentication failed.
        case userAuthenticationError = 7
        /// An error occurred while establishing a connection to the proxy tunnel.
        case proxyTunnelError = 8
        /// An invalid or malformed response has been received.
        case invalidResponse = 9
        /// The response ended prematurely.
        case responseEnded = 10
        /// The response exceeded a pre-configured limit such as "System.Net.Http.HttpClient.MaxResponseContentBufferSize" or "System.Net.Http.HttpClientHandler.MaxResponseHeadersLength".
        case configurationLimitExceeded = 11
    }

    public let message: String
    public let errorType: HttpErrorType
    public let httpCode: Int?
    public let context: String?
    
    public var errorDescription: String? { message }
}

public struct ProtonDriveSDKSocketNetworkError: LocalizedError, Sendable {
    // the comments and values for the cases were taken from dotNET
    public enum SocketErrorType: Int, Sendable {
        /// An unspecified Socket error has occurred.
        case socketError = -1
        /// The Socket operation succeeded.
        case success = 0
        /// The overlapped operation was aborted due to the closure of the Socket.
        case operationAborted = 995
        /// The application has initiated an overlapped operation that cannot be completed immediately.
        case ioPending = 997
        /// A blocking Socket call was canceled.
        case interrupted = 10004
        /// An attempt was made to access a Socket in a way that is forbidden by its access permissions.
        case accessDenied = 10013
        /// An invalid pointer address was detected by the underlying socket provider.
        case fault = 10014
        /// An invalid argument was supplied to a Socket member.
        case invalidArgument = 10022
        /// There are too many open sockets in the underlying socket provider.
        case tooManyOpenSockets = 10024
        /// An operation on a nonblocking socket cannot be completed immediately.
        case wouldBlock = 10035
        /// A blocking operation is in progress.
        case inProgress = 10036
        /// The nonblocking Socket already has an operation in progress.
        case alreadyInProgress = 10037
        /// A Socket operation was attempted on a non-socket.
        case notSocket = 10038
        /// A required address was omitted from an operation on a Socket.
        case destinationAddressRequired = 10039
        /// The datagram is too long.
        case messageSize = 10040
        /// The protocol type is incorrect for this Socket.
        case protocolType = 10041
        /// An unknown, invalid, or unsupported option or level was used with a Socket.
        case protocolOption = 10042
        /// The protocol is not implemented or has not been configured.
        case protocolNotSupported = 10043
        /// The support for the specified socket type does not exist in this address family.
        case socketNotSupported = 10044
        /// The address family is not supported by the protocol family.
        case operationNotSupported = 10045
        /// The protocol family is not implemented or has not been configured.
        case protocolFamilyNotSupported = 10046
        /// The address family specified is not supported. This error is returned if the IPv6 address family was specified and the IPv6 stack is not installed on the local machine. This error is returned if the IPv4 address family was specified and the IPv4 stack is not installed on the local machine.
        case addressFamilyNotSupported = 10047
        /// Only one use of an address is normally permitted.
        case addressAlreadyInUse = 10048
        /// The selected IP address is not valid in this context.
        case addressNotAvailable = 10049
        /// The network is not available.
        case networkDown = 10050
        /// No route to the remote host exists.
        case networkUnreachable = 10051
        /// The application tried to set KeepAlive on a connection that has already timed out.
        case networkReset = 10052
        /// The connection was aborted by .NET or the underlying socket provider.
        case connectionAborted = 10053
        /// The connection was reset by the remote peer.
        case connectionReset = 10054
        /// No free buffer space is available for a Socket operation.
        case noBufferSpaceAvailable = 10055
        /// The Socket is already connected.
        case isConnected = 10056
        /// The application tried to send or receive data, and the Socket is not connected.
        case notConnected = 10057
        /// A request to send or receive data was disallowed because the Socket has already been closed.
        case shutdown = 10058
        /// The connection attempt timed out, or the connected host has failed to respond.
        case timedOut = 10060
        /// The remote host is actively refusing a connection.
        case connectionRefused = 10061
        /// The operation failed because the remote host is down.
        case hostDown = 10064
        /// There is no network route to the specified host.
        case hostUnreachable = 10065
        /// Too many processes are using the underlying socket provider.
        case processLimit = 10067
        /// The network subsystem is unavailable.
        case systemNotReady = 10091
        /// The version of the underlying socket provider is out of range.
        case versionNotSupported = 10092
        /// The underlying socket provider has not been initialized.
        case notInitialized = 10093
        /// A graceful shutdown is in progress.
        case disconnecting = 10101
        /// The specified class was not found.
        case typeNotFound = 10109
        /// No such host is known. The name is not an official host name or alias.
        case hostNotFound = 11001
        /// The name of the host could not be resolved. Try again later.
        case tryAgain = 11002
        /// The error is unrecoverable or the requested database cannot be located.
        case noRecovery = 11003
        /// The requested name or IP address was not found on the name server.
        case noData = 11004
    }
    
    public let message: String
    public let errorCode: Int
    public let errorType: SocketErrorType
    public let context: String?
    
    public var errorDescription: String? { message }
}
