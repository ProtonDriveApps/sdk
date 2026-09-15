import Foundation

let cCompatibleTelemetryRecordMetricCallback: CCallback = { statePointer, byteArray in
    guard let provider = SDKClientProvider.resolve(statePointer),
          let driveClient = provider.get() else { return }

    let sdkMetricEvent = Proton_Drive_Sdk_MetricEvent(byteArray: byteArray)
    do {
        let metricEvent = try MetricEvent(sdkMetricEvent: sdkMetricEvent)
        driveClient.record(metricEvent)
    } catch {
        let logEvent: LogEvent = .init(
            level: .error, message: "Failed to parse Telemetry Record: \(error)", category: "Telemetry",
            thread: Thread.current.number, file: #file, function: #function, line: #line
        )
        driveClient.log(logEvent)
    }
}
