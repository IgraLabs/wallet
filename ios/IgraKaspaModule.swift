import Foundation
import React

@objc(IgraKaspaModule)
class IgraKaspaModule: NSObject {
    private let bridgeVersion = "0.1.0"
    private let maxBenchmarkPayloadBytes = 256 * 1024
    private let maxBenchmarkIterations = 100_000

    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }

    @objc(getBridgeStatus:rejecter:)
    func getBridgeStatus(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        do {
            resolve(try decodeRustJson(igra_kaspa_backend_status_json()))
        } catch {
            resolve([
                "moduleName": "IgraKaspa",
                "bridgeVersion": bridgeVersion,
                "backend": "swift-placeholder",
                "rustBackend": false,
                "supportsCarrierSigning": false,
                "supportsBridgeBenchmark": true,
                "supportsCarrierAddressDerivation": false,
                "rustBackendLoadError": error.localizedDescription,
            ])
        }
    }

    @objc(echoPayload:resolver:rejecter:)
    func echoPayload(_ payload: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        resolve([
            "payloadBytes": payload.lengthOfBytes(using: .utf8),
            "checksum": checksum(payload),
        ])
    }

    @objc(benchmarkBridge:iterations:resolver:rejecter:)
    func benchmarkBridge(
        _ payloadBytes: NSNumber,
        iterations: NSNumber,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        let byteCount = min(max(payloadBytes.intValue, 0), maxBenchmarkPayloadBytes)
        let count = min(max(iterations.intValue, 1), maxBenchmarkIterations)
        let payload = String(repeating: "a", count: byteCount)

        let startedAt = DispatchTime.now().uptimeNanoseconds
        var sum = 0
        for _ in 0..<count {
            sum = sum ^ checksum(payload)
        }
        let elapsedNs = DispatchTime.now().uptimeNanoseconds - startedAt

        resolve([
            "iterations": count,
            "payloadBytes": byteCount,
            "elapsedMs": Double(elapsedNs) / 1_000_000.0,
            "nsPerIteration": Double(elapsedNs) / Double(count),
            "checksum": sum,
            "backend": "swift-placeholder",
        ])
    }

    @objc(deriveCarrierAddress:resolver:rejecter:)
    func deriveCarrierAddress(_ params: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        callRustCarrierMethod(
            params,
            resolver: resolve,
            rejecter: reject,
            method: "deriveCarrierAddress",
            rustCall: igra_kaspa_derive_carrier_address_json
        )
    }

    @objc(getCarrierBalance:resolver:rejecter:)
    func getCarrierBalance(_ params: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        reject(
            "E_IGRA_KASPA_CARRIER_BALANCE_UNIMPLEMENTED",
            "getCarrierBalance is not implemented in the Igra Kaspa native module yet.",
            nil
        )
    }

    @objc(buildAndSignCarrierTx:resolver:rejecter:)
    func buildAndSignCarrierTx(_ params: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        callRustCarrierMethod(
            params,
            resolver: resolve,
            rejecter: reject,
            method: "buildAndSignCarrierTx",
            rustCall: igra_kaspa_build_and_sign_carrier_tx_json
        )
    }

    @objc(submitCarrierTx:resolver:rejecter:)
    func submitCarrierTx(_ params: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        callRustCarrierMethod(
            params,
            resolver: resolve,
            rejecter: reject,
            method: "submitCarrierTx",
            rustCall: igra_kaspa_submit_carrier_tx_json
        )
    }

    private func callRustCarrierMethod(
        _ params: NSDictionary,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock,
        method: String,
        rustCall: (UnsafePointer<CChar>?) -> UnsafeMutablePointer<CChar>?
    ) {
        do {
            let json = try encodeJson(params)
            let response = try json.withCString { paramsPointer in
                try decodeRustJson(rustCall(paramsPointer))
            }
            resolve(response)
        } catch {
            rejectRustError(reject, method: method, error: error)
        }
    }

    private func encodeJson(_ params: NSDictionary) throws -> String {
        let data = try JSONSerialization.data(withJSONObject: params, options: [])
        guard let json = String(data: data, encoding: .utf8) else {
            throw RustBridgeError(message: "failed to UTF-8 encode params JSON")
        }
        return json
    }

    private func decodeRustJson(_ pointer: UnsafeMutablePointer<CChar>?) throws -> NSDictionary {
        guard let pointer else {
            throw RustBridgeError(message: "Rust backend returned a null JSON pointer")
        }
        defer {
            igra_kaspa_free_string(pointer)
        }

        let json = String(cString: pointer)
        guard let data = json.data(using: .utf8) else {
            throw RustBridgeError(message: "Rust backend returned non UTF-8 JSON")
        }
        let object = try JSONSerialization.jsonObject(with: data, options: [])
        guard let dictionary = object as? NSDictionary else {
            throw RustBridgeError(message: "Rust backend returned non-object JSON")
        }
        if let errorCode = dictionary["errorCode"] as? String, !errorCode.isEmpty {
            let message = dictionary["message"] as? String ?? "IgraKaspa native backend failed"
            throw RustBackendError(code: errorCode, message: message)
        }
        return dictionary
    }

    private func rejectRustError(_ reject: RCTPromiseRejectBlock, method: String, error: Error) {
        if let error = error as? RustBackendError {
            reject(error.code, error.message, nil)
            return
        }
        reject(
            "E_IGRA_KASPA_RUST_BRIDGE_FAILED",
            "\(method) failed in the iOS Rusty-Kaspa native backend: \(error.localizedDescription)",
            error
        )
    }

    private func checksum(_ value: String) -> Int {
        var hash = 0
        for scalar in value.unicodeScalars {
            hash = (hash &* 31) ^ Int(scalar.value)
        }
        return hash
    }
}

private struct RustBackendError: LocalizedError {
    let code: String
    let message: String

    var errorDescription: String? {
        message
    }
}

private struct RustBridgeError: LocalizedError {
    let message: String

    var errorDescription: String? {
        message
    }
}
