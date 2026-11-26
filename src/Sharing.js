import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Linking, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { cardNfc } from './device'
import { Button, CardPreview, Heading, Notice, colors, ui } from './ui'

const nfcMessages = {
  unsupported: 'This Android phone does not support NFC card emulation.',
  disabled: 'Turn on NFC in Android settings, then try again.',
  unavailable: 'NFC sharing could not start. Open this screen again and retry.',
  invalid: 'The card link could not be shared over NFC.',
}

export default function Sharing({ card }) {
  const [nfc, setNfc] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const timer = useRef(null)
  const operation = useRef(0)
  const width = useWindowDimensions().width
  const url = card.publicUrl

  const stop = useCallback(() => {
    operation.current++
    clearTimeout(timer.current)
    cardNfc?.stopShare().catch(() => {})
  }, [])

  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        stop()
        setNfc('')
        setBusy(false)
      }
    })
    return () => {
      listener.remove()
      stop()
    }
  }, [stop, url])

  async function startNfc() {
    stop()
    const attempt = operation.current
    setNfc('')
    setError('')
    setBusy(true)
    try {
      if (!cardNfc) throw new Error('Install the Tapfolio Android build to use NFC sharing.')
      const result = await cardNfc.startShare(url)
      if (operation.current !== attempt) return
      if (result !== 'ready') throw new Error(nfcMessages[result] ?? nfcMessages.unavailable)
      setNfc('Tap the backs of the phones together. Keep this screen open and unlock the receiving phone.')
      timer.current = setTimeout(() => {
        stop()
        setNfc('NFC sharing ended. Tap Start NFC sharing to try again.')
      }, 120_000)
    } catch (cause) {
      if (operation.current === attempt) setError(cause.message)
    } finally {
      if (operation.current === attempt) setBusy(false)
    }
  }

  function endNfc() {
    stop()
    setNfc('')
  }

  async function open(action) {
    setError('')
    try {
      await action()
    } catch (cause) {
      setError(cause.message)
    }
  }

  return (
    <>
      <Heading title="Share your card" detail="Recipients can open your card in a browser." />
      <CardPreview details={card.published} />
      <View style={ui.panel}>
        <Text style={ui.label}>Tap to share with NFC</Text>
        <Text style={ui.detail}>On a compatible receiving phone, turn on NFC and open the link prompt if one appears.</Text>
        <Button title="Start NFC sharing" onPress={startNfc} busy={busy} />
        {nfc.startsWith('Tap the backs') && <Button title="Stop NFC sharing" secondary onPress={endNfc} />}
        <Notice error={error} message={nfc} />
      </View>
      <View style={[ui.panel, styles.qr]}>
        <Text style={ui.label}>Scan QR code</Text>
        <QRCode value={url} size={Math.min(200, width - 90)} quietZone={12} color={colors.ink} />
        <Text selectable style={styles.url}>{url}</Text>
      </View>
      <Button title="Share link" secondary onPress={() => open(() => Share.share({ message: url }))} />
      <Button title="Open public card" secondary onPress={() => open(() => Linking.openURL(url))} />
    </>
  )
}

const styles = StyleSheet.create({
  qr: { alignItems: 'center' },
  url: { color: colors.dim, textAlign: 'center' },
})
