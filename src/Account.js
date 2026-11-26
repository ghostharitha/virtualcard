import React, { useState } from 'react'
import { Text, View } from 'react-native'
import { canUseBiometric, saveQuickKey } from './device'
import { Button, Field, Heading, Notice, ui } from './ui'

export default function Account({ user, request, methods, refreshMethods, leave }) {
  const [kind, setKind] = useState('')
  const [pin, setPin] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  function select(next) {
    setKind(next)
    setPin('')
    setConfirmation('')
    setPassword('')
    setError('')
    setMessage('')
  }

  async function enable() {
    setError('')
    if (kind === 'pin' && (!/^\d{6}$/.test(pin) || pin !== confirmation)) {
      setError('Enter and confirm the same six-digit PIN.')
      return
    }
    if (kind === 'biometric' && !canUseBiometric()) {
      setError('Set up a fingerprint supported by your Android device, then try again.')
      return
    }
    setBusy(true)
    try {
      const { key } = await request('/api/quick-login', { method: 'PUT', data: { kind, pin, password } })
      await saveQuickKey(kind, key)
      await refreshMethods()
      select('')
      setMessage(kind === 'pin' ? 'PIN sign-in enabled.' : 'Fingerprint sign-in enabled.')
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  const action = async forget => {
    setBusy(true)
    setError('')
    try {
      await leave(forget)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Heading title="Account" detail={user.email} />
      {user.role === 'user' && <View style={ui.panel}>
        <Text style={ui.label}>Quick sign-in on this phone</Text>
        {kind ? (
          <>
            {kind === 'pin' && <>
              <Field label="Six-digit PIN" value={pin} onChangeText={setPin} secureTextEntry keyboardType="number-pad" maxLength={6} />
              <Field label="Confirm PIN" value={confirmation} onChangeText={setConfirmation} secureTextEntry keyboardType="number-pad" maxLength={6} />
            </>}
            <Field label="Account password" value={password} onChangeText={setPassword} secureTextEntry maxLength={128} />
            <Button title={kind === 'pin' ? 'Save PIN' : 'Enable fingerprint'} onPress={enable} busy={busy} />
            <Button title="Cancel" secondary onPress={() => select('')} disabled={busy} />
          </>
        ) : (
          <>
            <Button title={methods.pin ? 'Change PIN' : 'Set up PIN'} secondary onPress={() => select('pin')} disabled={busy} />
            <Button title={methods.biometric ? 'Set up fingerprint again' : 'Set up fingerprint'}
              secondary onPress={() => select('biometric')} disabled={busy} />
          </>
        )}
      </View>}
      <Notice error={error} message={message} />
      {user.role === 'user' && !kind && (methods.pin || methods.biometric) &&
        <Button title="Lock app" secondary onPress={() => action(false)} disabled={busy} />}
      {!kind && <Button title="Sign out" secondary onPress={() => action(true)} disabled={busy} />}
    </>
  )
}
