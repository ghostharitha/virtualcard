package com.tapfolio.nfc

import android.nfc.cardemulation.HostApduService
import android.os.Bundle
import android.os.SystemClock

class CardShareService : HostApduService() {
  private var currentShare: TapSession.Share? = null
  private var tag: Type4Tag? = null

  override fun processCommandApdu(command: ByteArray, extras: Bundle?): ByteArray {
    val share = TapSession.active
    if (share == null || share.expires <= SystemClock.elapsedRealtime()) {
      currentShare = null
      tag = null
      return byteArrayOf(0x6A, 0x82.toByte())
    }
    if (currentShare !== share || tag == null) {
      currentShare = share
      tag = Type4Tag(share.message)
    }
    return tag!!.respond(command)
  }

  override fun onDeactivated(reason: Int) {
    currentShare = null
    tag = null
  }
}
