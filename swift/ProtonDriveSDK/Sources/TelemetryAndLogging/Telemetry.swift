import Foundation

let cCompatibleTelemetryRecordMetricCallback: CCallback = { statePointer, byteArray in
    guard let stateRawPointer = UnsafeRawPointer(bitPattern: statePointer) else {
        return
    }
    
    let stateTypedPointer = Unmanaged<BoxedContinuationWithState<Int, WeakReference<ProtonDriveClient>>>.fromOpaque(stateRawPointer)
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
