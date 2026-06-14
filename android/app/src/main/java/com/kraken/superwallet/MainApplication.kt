package com.kraken.superwallet

import android.app.Application
import android.content.res.Configuration
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.soloader.OpenSourceMergedSoMapping
import com.facebook.soloader.SoLoader
import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper

import com.kraken.superwallet.modules.activityLifecycle.ActivityLifecyclePackage
import com.kraken.superwallet.modules.boottime.BootTimePackage
import com.kraken.superwallet.modules.gradients.WalletGradientViewPackage
import com.kraken.superwallet.modules.igrakaspa.IgraKaspaPackage
import com.kraken.superwallet.modules.clipboard.SensitiveClipboardPackage
import com.kraken.superwallet.modules.minimizer.MinimizerPackage

class MainApplication : Application(), ReactApplication {

  private val _reactNativeHost: ReactNativeHost =
    ReactNativeHostWrapper(this, object : DefaultReactNativeHost(this) {
      override fun getUseDeveloperSupport() = BuildConfig.DEBUG

      override fun getPackages(): List<ReactPackage> {
        val packages = PackageList(this).packages
        packages.add(SensitiveClipboardPackage())
        packages.add(BootTimePackage())
        packages.add(WalletGradientViewPackage())
        packages.add(IgraKaspaPackage())
        packages.add(ActivityLifecyclePackage())
        packages.add(MinimizerPackage())
        return packages
      }

      override fun getJSMainModuleName() = "index"

      // Remove these for your RN version (they caused "overrides nothing"):
      // override fun isNewArchEnabled() = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
      // override fun isHermesEnabled() = BuildConfig.IS_HERMES_ENABLED
    })

  override val reactNativeHost: ReactNativeHost
    get() = _reactNativeHost

  override fun onCreate() {
    super.onCreate()

    // Kotlin: no `.INSTANCE` here
    SoLoader.init(this, OpenSourceMergedSoMapping)

    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      DefaultNewArchitectureEntryPoint.load()
    }
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
