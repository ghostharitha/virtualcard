import React, { useState } from 'react'
import { Text, View } from 'react-native'
import { api } from './api'
import { deviceId, quickKey } from './device'
import { Button, Field, Heading, Notice, ui } from './ui'

const titles = {
  login: 'Sign in',
  register: 'Create your account',
  admin: 'Admin sign-in',
  pin: 'Enter your PIN',
}

export default function SignIn({ methods, onSession, initialMessage }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState(initialMessage)

  function switchTo(next) {
    setMode(next)
    setError('')
    setMessage('')
    setPassword('')
    setPin('')
  }

  async function submit(kind) {
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const device = await deviceId()
      if (kind === 'pin' || kind === 'biometric') {
        const key = await quickKey(kind)
        if (!key) throw new Error('Sign in with your password to set up quick sign-in again.')
        await onSession(await api('/api/quick-login', { method: 'POST', data: { key, device, pin } }))
      } else {
        const path = { login: '/api/login', register: '/api/register', admin: '/api/admin/login' }[kind]
        await onSession(await api(path, { method: 'POST', data: { email, password, device } }))
      }
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <View style={ui.card}>
        <Text style={ui.cardBrand}>TAPFOLIO</Text>
        <Text style={ui.cardName}>Your digital business card</Text>
        <Text style={ui.cardDetail}>Share your details with a tap, a scan or a link.</Text>
      </View>
      <Heading title={titles[mode]} />
      <View style={ui.panel}>
        {mode === 'pin'
          ? <Field label="Six-digit PIN" value={pin} onChangeText={setPin}
              secureTextEntry keyboardType="number-pad" maxLength={6} />
          : <>
              <Field label="Email address" value={email} onChangeText={setEmail} autoCapitalize="none"
                autoComplete="email" keyboardType="email-address" />
              <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                placeholder={mode === 'register' ? 'At least 10 characters' : undefined} maxLength={128} />
            </>}
        <Notice error={error} message={message} />
        <Button title={mode === 'register' ? 'Create account' : 'Sign in'} busy={busy} onPress={() => submit(mode)} />
      </View>
      {mode === 'login' ? (
        <View style={ui.group}>
          {methods.biometric && <Button title="Use fingerprint" secondary disabled={busy} onPress={() => submit('biometric')} />}
          {methods.pin && <Button title="Use PIN" secondary disabled={busy} onPress={() => switchTo('pin')} />}
          <Button title="Create account" secondary disabled={busy} onPress={() => switchTo('register')} />
          <Button title="Admin sign-in" secondary disabled={busy} onPress={() => switchTo('admin')} />
        </View>
      ) : <Button title="Back to sign-in" secondary disabled={busy} onPress={() => switchTo('login')} />}
    </>
  )
}
