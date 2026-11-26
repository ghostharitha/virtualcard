import React, { useState } from 'react'
import { View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Button, CardPreview, Field, Heading, Notice, ui } from './ui'

const fields = [
  ['fullName', 'Full name', 100, { autoComplete: 'name' }],
  ['jobTitle', 'Job title', 100],
  ['company', 'Company', 120],
  ['category', 'Category', 80],
  ['email', 'Email address', 254, { autoCapitalize: 'none', keyboardType: 'email-address' }],
  ['phone', 'Phone number', 45, { keyboardType: 'phone-pad' }],
  ['website', 'Website URL', 300],
  ['linkedin', 'LinkedIn profile URL', 300],
  ['instagram', 'Instagram profile URL', 300],
  ['about', 'Short bio / About you', 800, { multiline: true }],
]
const urlFields = ['website', 'linkedin', 'instagram']

export default function CardForm({ card, ownerEmail, save, reload, close }) {
  const admin = Boolean(ownerEmail)
  const [details, setDetails] = useState(card?.draft ?? {})
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const update = (key, value) => setDetails(current => ({ ...current, [key]: value }))

  async function selectPhoto() {
    setError('')
    setPicking(true)
    try {
      const selection = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.45, base64: true,
      })
      if (selection.canceled) return
      const photo = selection.assets[0]?.base64
      if (!photo || photo.length > 1_400_000) throw new Error('Choose a smaller photo.')
      update('photo', photo)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setPicking(false)
    }
  }

  async function submit() {
    if (!details.fullName?.trim()) {
      setError('Enter a full name.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await save({ details, revision: card?.revision ?? 0 })
    } catch (cause) {
      setError(cause.message)
      setConflict(cause.status === 409)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Heading title={admin ? 'Publish business card' : card ? 'Edit business card' : 'Create business card'}
        detail={admin ? ownerEmail : 'Choose what to include on your public card. Only the full name is required.'} />
      <CardPreview details={details} />
      <View style={ui.panel}>
        <Button title={details.photo ? 'Change photo' : 'Upload photo'} secondary onPress={selectPhoto} busy={picking} />
        {!!details.photo && <Button title="Remove photo" secondary onPress={() => update('photo', '')} />}
        {fields.map(([key, label, maxLength, props]) => (
          <Field key={key} label={label} value={details[key] ?? ''} maxLength={maxLength}
            onChangeText={value => update(key, value)}
            {...(urlFields.includes(key) && { autoCapitalize: 'none', keyboardType: 'url', placeholder: 'https://' })}
            {...props} />
        ))}
        <Notice error={error} />
        {conflict && <Button title="Reload latest details" secondary onPress={reload} />}
        <Button title={admin ? 'Publish card' : 'Submit for review'} onPress={submit}
          busy={busy} disabled={picking || conflict} />
      </View>
      <Button title="Cancel" secondary onPress={close} disabled={busy} />
    </>
  )
}
