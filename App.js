import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator, AppState, BackHandler, Pressable, RefreshControl, ScrollView, StatusBar,
  StyleSheet, Text, View,
} from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import CardForm from './src/CardForm'
import SignIn from './src/SignIn'
import Sharing from './src/Sharing'
import Account from './src/Account'
import { api } from './src/api'
import { clearQuickKeys, quickMethods, rememberAccount } from './src/device'
import { Button, CardPreview, Heading, Notice, colors, statusLabels, ui } from './src/ui'

function Frame({ children, back, account, refresh, refreshing }) {
  useEffect(() => {
    if (!back) return undefined
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      back()
      return true
    })
    return () => listener.remove()
  }, [back])

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        {back ? <Pressable accessibilityRole="button" style={styles.headerLink} onPress={back}>
          <Text style={styles.headerText}>Back</Text>
        </Pressable> : <Text style={styles.wordmark}>Tapfolio</Text>}
        {account && <Pressable accessibilityRole="button" style={styles.headerLink} onPress={account}>
          <Text style={styles.headerText}>Account</Text>
        </Pressable>}
      </View>
      <ScrollView key={back ? 'detail' : 'root'} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        refreshControl={refresh ? <RefreshControl refreshing={refreshing} onRefresh={refresh} /> : undefined}
        contentContainerStyle={styles.content}>
        {children}
      </ScrollView>
    </SafeAreaView>
  )
}

function Workspace({ session, request, methods, refreshMethods, leave }) {
  const admin = session.user.role === 'admin'
  const [screen, setScreen] = useState('home')
  const [card, setCard] = useState(null)
  const [target, setTarget] = useState(null)
  const [users, setUsers] = useState([])
  const [next, setNext] = useState(null)
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [formKey, setFormKey] = useState(0)
  const sequence = useRef(0)

  const refreshHome = useCallback(async (after = '', quiet = false) => {
    const requestId = ++sequence.current
    if (!quiet) setLoading(true)
    setError('')
    try {
      if (admin) {
        const data = await request('/api/admin/users?after=' + encodeURIComponent(after))
        if (requestId !== sequence.current) return
        setUsers(current => after ? [...current, ...data.users] : data.users)
        setNext(data.next)
      } else {
        const data = await request('/api/card')
        if (requestId !== sequence.current) return
        setCard(data.card)
      }
      setHasLoaded(true)
    } catch (cause) {
      if (requestId === sequence.current && !quiet) setError(cause.message)
    } finally {
      if (requestId === sequence.current) setLoading(false)
    }
  }, [admin, request])

  useEffect(() => {
    if (screen !== 'home') return undefined
    refreshHome()
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refreshHome()
    })
    return () => {
      sequence.current++
      subscription.remove()
    }
  }, [refreshHome, screen])

  const pending = !admin && ['pending', 'updates_pending'].includes(card?.status)
  useEffect(() => {
    if (screen !== 'home' || !pending) return undefined
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') refreshHome('', true)
    }, 15_000)
    return () => clearInterval(timer)
  }, [pending, refreshHome, screen])

  const goHome = () => {
    setError('')
    setLoading(false)
    setScreen('home')
  }
  const cardPath = user => '/api/admin/users/' + user.id + '/card'

  async function openAdminCard(user) {
    const requestId = ++sequence.current
    setLoading(true)
    setError('')
    try {
      const data = await request(cardPath(user))
      if (requestId !== sequence.current) return
      setTarget(data.user)
      setCard(data.card)
      setScreen('form')
    } catch (cause) {
      if (requestId === sequence.current) setError(cause.message)
    } finally {
      if (requestId === sequence.current) setLoading(false)
    }
  }

  async function save(input) {
    const data = await request(admin ? cardPath(target) : '/api/card', { method: 'PUT', data: input })
    setCard(data.card)
    setMessage(admin ? 'Business card published.' : 'Your details were sent to the admin for review.')
    goHome()
  }

  async function reloadCard() {
    setError('')
    try {
      const data = await request(admin ? cardPath(target) : '/api/card')
      setCard(data.card)
      setFormKey(current => current + 1)
    } catch (cause) {
      setError(cause.message)
    }
  }

  if (screen === 'account') {
    return <Frame back={goHome}><Account {...{ user: session.user, request, methods, refreshMethods, leave }} /></Frame>
  }
  if (screen === 'form') {
    return <Frame back={goHome}>
      <Notice error={error} />
      <CardForm key={formKey} card={card} ownerEmail={admin ? target.email : undefined}
        save={save} reload={reloadCard} close={goHome} />
    </Frame>
  }
  if (screen === 'share' && card?.publicUrl) {
    return <Frame back={goHome}><Sharing card={card} /></Frame>
  }

  return (
    <Frame account={() => setScreen('account')} refresh={() => refreshHome()} refreshing={loading}>
      <Heading title={admin ? 'Admin dashboard' : 'My business card'}
        detail={admin ? 'Review submitted details and publish cards for users.' : undefined} />
      <Notice error={error} message={message} />
      {loading && !hasLoaded && <ActivityIndicator color={colors.ink} />}
      {!loading && !hasLoaded && <Button title="Retry" onPress={() => refreshHome()} />}
      {hasLoaded && admin && <>
        {users.length === 0 && <View style={ui.panel}><Text style={ui.detail}>No user accounts yet.</Text></View>}
        {users.map(user => (
          <View style={ui.panel} key={user.id}>
            <Text style={ui.label}>{user.card?.fullName ?? user.email}</Text>
            {user.card && <Text style={ui.detail}>{user.email}</Text>}
            <Text style={ui.detail}>{statusLabels[user.card?.status] ?? 'No card submitted'}</Text>
            <Button title={user.card ? 'View details' : 'Create card'} secondary
              onPress={() => openAdminCard(user)} disabled={loading} />
          </View>
        ))}
        {!!next && <Button title="Load more users" secondary onPress={() => refreshHome(next)} disabled={loading} />}
      </>}
      {hasLoaded && !admin && (card ? (
        <>
          <CardPreview details={card.published ?? card.draft} status={card.status} />
          {pending && <Text style={ui.detail}>{card.published
            ? 'Your current card is live while the admin reviews your changes.'
            : 'Your card will appear here when the admin publishes it.'}</Text>}
          {!!card.publicUrl && <Button title="Share card" onPress={() => setScreen('share')} />}
          <Button title="Edit my details" secondary onPress={() => { setMessage(''); setScreen('form') }} />
        </>
      ) : (
        <>
          <CardPreview />
          <Text style={ui.detail}>Add your contact details and submit your card for review.</Text>
          <Button title="Create business card" onPress={() => setScreen('form')} />
        </>
      ))}
    </Frame>
  )
}

const emptyMethods = { pin: false, biometric: false }

export default function App() {
  const [session, setSession] = useState(null)
  const [methods, setMethods] = useState(emptyMethods)
  const [message, setMessage] = useState('')
  const refreshMethods = useCallback(async () => setMethods(await quickMethods()), [])

  useEffect(() => {
    refreshMethods().catch(() => {})
  }, [refreshMethods])

  async function onSession(next) {
    if (next.user.role === 'user') {
      await rememberAccount(next.user.id)
      await refreshMethods()
    }
    setMessage('')
    setSession(next)
  }

  const request = useCallback(async (path, options) => {
    try {
      return await api(path, { ...options, token: session?.token })
    } catch (error) {
      if (error.status === 401 && error.message === 'Sign in to continue.') {
        setMessage('Your session expired. Sign in to continue.')
        setSession(current => current?.token === session?.token ? null : current)
      }
      throw error
    }
  }, [session?.token])

  async function leave(forgetDevice) {
    if (forgetDevice && session.user.role === 'user') {
      await clearQuickKeys()
      setMethods(emptyMethods)
    }
    // Local sign-out also works when the network is unavailable.
    await api('/api/logout', { method: 'POST', data: { forgetDevice }, token: session.token }).catch(() => {})
    setMessage(forgetDevice ? 'Signed out.' : 'App locked.')
    setSession(null)
  }

  return (
    <SafeAreaProvider>
      {session ? <Workspace key={session.token} {...{ session, request, methods, refreshMethods, leave }} />
        : <Frame><SignIn methods={methods} onSession={onSession} initialMessage={message} /></Frame>}
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { minHeight: 54, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordmark: { color: colors.ink, fontWeight: '800', fontSize: 22, letterSpacing: -0.6 },
  headerLink: { minHeight: 48, justifyContent: 'center' },
  headerText: { color: colors.ink, fontWeight: '700', fontSize: 16 },
  content: { gap: 18, paddingHorizontal: 20, paddingTop: 15, paddingBottom: 36, width: '100%', maxWidth: 630, alignSelf: 'center' },
})
