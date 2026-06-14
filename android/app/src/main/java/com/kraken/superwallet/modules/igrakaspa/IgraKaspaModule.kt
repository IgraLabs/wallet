package com.kraken.superwallet.modules.igrakaspa

import android.os.SystemClock
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

class IgraKaspaModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String {
        return "IgraKaspa"
    }

    @ReactMethod
    fun getBridgeStatus(promise: Promise) {
        val status = Arguments.createMap()
        status.putString("moduleName", name)
        status.putString("bridgeVersion", BRIDGE_VERSION)
        status.putString("backend", "kotlin-placeholder")
        status.putBoolean("rustBackend", false)
        status.putBoolean("supportsCarrierSigning", false)
        status.putBoolean("supportsBridgeBenchmark", true)
        promise.resolve(status)
    }

    @ReactMethod
    fun echoPayload(payload: String, promise: Promise) {
        val result = Arguments.createMap()
        result.putDouble("payloadBytes", payload.toByteArray(Charsets.UTF_8).size.toDouble())
        result.putDouble("checksum", checksum(payload).toDouble())
        promise.resolve(result)
    }

    @ReactMethod
    fun benchmarkBridge(payloadBytes: Double, iterations: Double, promise: Promise) {
        val byteCount = payloadBytes.toInt().coerceIn(0, MAX_BENCHMARK_PAYLOAD_BYTES)
        val count = iterations.toInt().coerceIn(1, MAX_BENCHMARK_ITERATIONS)
        val payload = "a".repeat(byteCount)

        val startedAt = SystemClock.elapsedRealtimeNanos()
        var checksum = 0
        for (i in 0 until count) {
            checksum = checksum xor checksum(payload)
        }
        val elapsedNs = SystemClock.elapsedRealtimeNanos() - startedAt

        val result = Arguments.createMap()
        result.putDouble("iterations", count.toDouble())
        result.putDouble("payloadBytes", byteCount.toDouble())
        result.putDouble("elapsedMs", elapsedNs.toDouble() / 1_000_000.0)
        result.putDouble("nsPerIteration", elapsedNs.toDouble() / count.toDouble())
        result.putDouble("checksum", checksum.toDouble())
        result.putString("backend", "kotlin-placeholder")
        promise.resolve(result)
    }

    @ReactMethod
    fun deriveCarrierAddress(params: ReadableMap, promise: Promise) {
        rejectRustBackendMissing(promise, "deriveCarrierAddress")
    }

    @ReactMethod
    fun getCarrierBalance(params: ReadableMap, promise: Promise) {
        rejectRustBackendMissing(promise, "getCarrierBalance")
    }

    @ReactMethod
    fun buildAndSignCarrierTx(params: ReadableMap, promise: Promise) {
        rejectRustBackendMissing(promise, "buildAndSignCarrierTx")
    }

    @ReactMethod
    fun submitCarrierTx(params: ReadableMap, promise: Promise) {
        rejectRustBackendMissing(promise, "submitCarrierTx")
    }

    private fun rejectRustBackendMissing(promise: Promise, method: String) {
        promise.reject(
            "E_IGRA_KASPA_RUST_BACKEND_MISSING",
            "$method requires the Rusty-Kaspa native backend. The RN bridge is present, but carrier signing is intentionally disabled."
        )
    }

    private fun checksum(value: String): Int {
        var hash = 0
        for (char in value) {
            hash = (hash * 31) xor char.code
        }
        return hash
    }

    companion object {
        private const val BRIDGE_VERSION = "0.1.0"
        private const val MAX_BENCHMARK_PAYLOAD_BYTES = 256 * 1024
        private const val MAX_BENCHMARK_ITERATIONS = 100_000
    }
}
