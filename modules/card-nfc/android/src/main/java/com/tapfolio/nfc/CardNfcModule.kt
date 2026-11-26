package com.tapfolio.nfc

import android.content.ComponentName
import android.content.pm.PackageManager
import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.nfc.NfcAdapter
import android.nfc.cardemulation.CardEmulation
import android.os.SystemClock
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.functions.Queues

internal object TapSession {
  data class Share(val message: ByteArray, val expires: Long)

  @Volatile var active: Share? = null
}

class CardNfcModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CardNfc")

    AsyncFunction("startShare") { link: String ->
      val activity = appContext.currentActivity ?: return@AsyncFunction "unavailable"
      if (!activity.packageManager.hasSystemFeature(PackageManager.FEATURE_NFC_HOST_CARD_EMULATION)) {
        return@AsyncFunction "unsupported"
      }
      val adapter = NfcAdapter.getDefaultAdapter(activity) ?: return@AsyncFunction "unsupported"
      if (!adapter.isEnabled) return@AsyncFunction "disabled"
      val uri = Uri.parse(link)
      if (uri.scheme !in listOf("https", "http") || uri.host.isNullOrBlank()) {
        return@AsyncFunction "invalid"
      }
      val message = NdefMessage(arrayOf(NdefRecord.createUri(uri))).toByteArray()
      if (message.size + 2 > Type4Tag.FILE_SIZE) return@AsyncFunction "invalid"
      val target = ComponentName(activity, CardShareService::class.java)
      val preferred = CardEmulation.getInstance(adapter).setPreferredService(activity, target)
      if (!preferred) return@AsyncFunction "unavailable"
      TapSession.active = TapSession.Share(message, SystemClock.elapsedRealtime() + 120_000)
      "ready"
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stopShare") { stopSharing() }.runOnQueue(Queues.MAIN)
    OnActivityEntersBackground { stopSharing() }
  }

  private fun stopSharing() {
    TapSession.active = null
    val activity = appContext.currentActivity ?: return
    val adapter = NfcAdapter.getDefaultAdapter(activity) ?: return
    if (activity.packageManager.hasSystemFeature(PackageManager.FEATURE_NFC_HOST_CARD_EMULATION)) {
      runCatching { CardEmulation.getInstance(adapter).unsetPreferredService(activity) }
    }
  }
}
