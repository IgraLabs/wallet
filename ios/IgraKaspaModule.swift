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
        resolve([
            "moduleName": "IgraKaspa",
            "bridgeVersion": bridgeVersion,
            "backend": "swift-placeholder",
            "rustBackend": false,
            "supportsCarrierSigning": false,
            "supportsBridgeBenchmark": true,
        ])
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
        rejectRustBackendMissing(reject, method: "deriveCarrierAddress")
    }

    @objc(getCarrierBalance:resolver:rejecter:)
    func getCarrierBalance(_ params: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        rejectRustBackendMissing(reject, method: "getCarrierBalance")
    }

    @objc(buildAndSignCarrierTx:resolver:rejecter:)
    func buildAndSignCarrierTx(_ params: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        rejectRustBackendMissing(reject, method: "buildAndSignCarrierTx")
    }

    @objc(submitCarrierTx:resolver:rejecter:)
    func submitCarrierTx(_ params: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        rejectRustBackendMissing(reject, method: "submitCarrierTx")
    }

    private func rejectRustBackendMissing(_ reject: RCTPromiseRejectBlock, method: String) {
        reject(
            "E_IGRA_KASPA_RUST_BACKEND_MISSING",
            "\(method) requires the Rusty-Kaspa native backend. The RN bridge is present, but carrier signing is intentionally disabled.",
            nil
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
