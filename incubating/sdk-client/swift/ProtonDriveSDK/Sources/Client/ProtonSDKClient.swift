import Foundation

protocol ProtonSDKClient: AnyObject, Sendable {
    var accountClient: AccountClientProtocol { get }
    var configuration: ProtonDriveClientConfiguration { get }
    var httpClient: HttpClientProtocol { get }
    var logger: ProtonDriveSDK.Logger { get }
    var recordMetricEventCallback: RecordMetricEventCallback { get }
    var featureFlagProviderCallback: FeatureFlagProviderCallback { get }

    func log(_ logEvent: LogEvent)
    func record(_ metricEvent: MetricEvent)
    func isFlagEnabled(_ flagName: String) -> Bool
}

extension ProtonSDKClient {
    func log(_ logEvent: LogEvent) {
        logger.logCallback(logEvent)
    }

    func record(_ metricEvent: MetricEvent) {
        recordMetricEventCallback(metricEvent)
    }

    func isFlagEnabled(_ flagName: String) -> Bool {
        // Since the C# callback expects a synchronous return but our Swift callback has completion block,
        // we need to block and wait for the async result using a semaphore
        let semaphore = DispatchSemaphore(value: 0)
        var result = false
        featureFlagProviderCallback(flagName) { resultValue in
            result = resultValue
            semaphore.signal()
        }
        semaphore.wait()
        return result
    }
}
