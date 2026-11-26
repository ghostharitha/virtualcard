import React from 'react'
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

export const colors = {
  bg: '#EFF5F1', white: '#FFFFFF', ink: '#112B25', dim: '#48645B',
  border: '#CEDDD4', mint: '#B7F2CB', dark: '#102C26', faded: '#BFDBCF', error: '#982C26',
}

export function Button({ title, onPress, secondary = false, disabled = false, busy = false }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled || busy} onPress={onPress}
      style={({ pressed }) => [
        ui.button, secondary && ui.secondary, (pressed || disabled || busy) && ui.muted,
      ]}>
      {busy ? <ActivityIndicator color={secondary ? colors.ink : colors.white} /> :
        <Text style={[ui.buttonText, secondary && ui.secondaryText]}>{title}</Text>}
    </Pressable>
  )
}

export function Field({ label, ...props }) {
  return (
    <View style={ui.field}>
      <Text style={ui.label}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={colors.dim}
        style={[ui.input, props.multiline && ui.multiline]} {...props} />
    </View>
  )
}

export function Heading({ title, detail }) {
  return <View style={ui.heading}>
    <Text accessibilityRole="header" style={ui.title}>{title}</Text>
    {detail && <Text style={ui.detail}>{detail}</Text>}
  </View>
}

export function Notice({ error, message }) {
  if (!error && !message) return null
  return <Text accessibilityLiveRegion="polite" style={error ? ui.error : ui.notice}>{error || message}</Text>
}

export const statusLabels = {
  published: 'Published',
  pending: 'Awaiting review',
  updates_pending: 'Update awaiting review',
}

export function CardPreview({ details, status }) {
  const name = details?.fullName ?? 'Your name'
  const initials = name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('')
  const role = [details?.jobTitle, details?.company].filter(Boolean).join(' · ')
  return (
    <View style={ui.card}>
      <View style={ui.cardTop}>
        <Text style={ui.cardBrand}>TAPFOLIO</Text>
        {!!status && <Text style={ui.cardStatus}>{statusLabels[status]}</Text>}
      </View>
      {details?.photo
        ? <Image accessibilityLabel="Card photo" style={ui.avatar}
            source={{ uri: 'data:image/jpeg;base64,' + details.photo }} />
        : <View style={ui.avatar}><Text style={ui.initials}>{initials}</Text></View>}
      <Text style={ui.cardName}>{name}</Text>
      {!!role && <Text style={ui.cardDetail}>{role}</Text>}
      {!!details?.category && <Text style={ui.cardDetail}>{details.category}</Text>}
    </View>
  )
}

export const ui = StyleSheet.create({
  group: { gap: 12 },
  panel: { backgroundColor: colors.white, borderRadius: 22, padding: 20, gap: 14, borderWidth: 1, borderColor: colors.border },
  heading: { gap: 5 },
  title: { color: colors.ink, fontSize: 32, fontWeight: '800', letterSpacing: -1.2 },
  detail: { color: colors.dim, fontSize: 16, lineHeight: 23 },
  label: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  button: { minHeight: 50, paddingVertical: 12, paddingHorizontal: 17, borderRadius: 14, backgroundColor: colors.dark, justifyContent: 'center', alignItems: 'center' },
  secondary: { backgroundColor: colors.white, borderColor: colors.border, borderWidth: 1 },
  muted: { opacity: 0.65 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  secondaryText: { color: colors.ink },
  field: { gap: 6 },
  input: { backgroundColor: colors.white, borderColor: colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, color: colors.ink, fontSize: 16, minHeight: 49 },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
  notice: { color: colors.ink, backgroundColor: colors.mint, padding: 12, borderRadius: 10, fontSize: 15 },
  error: { color: colors.error, backgroundColor: '#FCE9E5', padding: 12, borderRadius: 10, fontSize: 15 },
  card: { backgroundColor: colors.dark, borderRadius: 24, padding: 24, gap: 5 },
  cardTop: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 20 },
  cardBrand: { color: colors.mint, fontWeight: '800', letterSpacing: 1.5, fontSize: 13 },
  cardStatus: { color: colors.faded, fontSize: 13, fontWeight: '600' },
  avatar: { height: 65, width: 65, borderRadius: 18, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center', marginBottom: 7 },
  initials: { color: colors.ink, fontSize: 22, fontWeight: '800', textTransform: 'uppercase' },
  cardName: { color: colors.white, fontSize: 27, fontWeight: '800' },
  cardDetail: { color: colors.faded, fontSize: 15 },
})
