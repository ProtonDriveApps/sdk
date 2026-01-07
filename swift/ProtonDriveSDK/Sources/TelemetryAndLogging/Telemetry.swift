import Foundation

let cCompatibleTelemetryRecordMetricCallback: CCallback = { statePointer, byteArray in
    guard let stateRawPointer = UnsafeRawPointer(bitPattern: statePointer) else {
        let message = "cCompatibleTelemetryRecordMetricCallback.statePointer is nil"
        assertionFailure(message)
        // there is no way we can inform the SDK back about the issue
        return
    }
    
    let stateTypedPointer = Unmanaged<BoxedCompletionBlock<Int, SDKClientProvider>>.fromOpaque(stateRawPointer)
    let provider = stateTypedPointer.takeUnretainedValue().state

    guard let driveClient = provider.get() else {
        // we don't release the stateTypedPointer by design — there might be some calls coming from the SDK racing with the client deallocation
        // stateTypedPointer.release()
        return
    }
    
    let sdkMetricEvent = Proton_Sdk_MetricEvent(byteArray: byteArray)
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
