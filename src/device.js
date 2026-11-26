import * as Crypto from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'
import { requireOptionalNativeModule } from 'expo-modules-core'

const get = SecureStore.getItemAsync
const set = SecureStore.setItemAsync
const remove = SecureStore.deleteItemAsync
const biometricOptions = {
  requireAuthentication: true,
  keychainService: 'tapfolio-fingerprint',
  authenticationPrompt: 'Verify your fingerprint to access Tapfolio',
}

export const cardNfc = requireOptionalNativeModule('CardNfc')

export async function deviceId() {
  const stored = await get('tapfolio-device')
  if (stored) return stored
  const id = Crypto.randomUUID()
  await set('tapfolio-device', id)
  return id
}

export async function quickMethods() {
  const [pin, biometric] = await Promise.all([get('tapfolio-pin'), get('tapfolio-biometric-enabled')])
  return { pin: Boolean(pin), biometric: Boolean(biometric) }
}

export function quickKey(kind) {
  return kind === 'pin' ? get('tapfolio-pin') : get('tapfolio-biometric', biometricOptions)
}

export async function saveQuickKey(kind, key) {
  if (kind === 'pin') {
    await set('tapfolio-pin', key)
    return
  }
  await set('tapfolio-biometric', key, biometricOptions)
  await set('tapfolio-biometric-enabled', '1')
}

export const canUseBiometric = SecureStore.canUseBiometricAuthentication

export async function clearQuickKeys() {
  await Promise.all([
    remove('tapfolio-pin'),
    remove('tapfolio-biometric', biometricOptions),
    remove('tapfolio-biometric-enabled'),
    remove('tapfolio-owner'),
  ])
}

export async function rememberAccount(accountId) {
  const lastAccount = await get('tapfolio-owner')
  if (lastAccount && lastAccount !== accountId) await clearQuickKeys()
  await set('tapfolio-owner', accountId)
}
