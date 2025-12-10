import Foundation

let cCompatibleTelemetryRecordMetricCallback: CCallback = { statePointer, byteArray in
    guard let stateRawPointer = UnsafeRawPointer(bitPattern: statePointer) else {
        let message = "cCompatibleTelemetryRecordMetricCallback.statePointer is nil"
        assertionFailure(message)
        // there is no way we can inform the SDK back about the issue
        return
    }
    
    let stateTypedPointer = Unmanaged<BoxedCompletionBlock<Int, WeakReference<ProtonDriveClient>>>.fromOpaque(stateRawPointer)
    let weakDriveClient = stateTypedPointer.takeUnretainedValue().state
    
    guard let driveClient = weakDriveClient.value else {
        stateTypedPointer.release()
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
