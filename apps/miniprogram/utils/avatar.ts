import { formatDurationMs } from './format'

const DEFAULT_AVATARS = {
  female00To02: '/assets/avatars/age-00-02-female.png',
  male00To02: '/assets/avatars/age-00-02-male.png',
  female03To05: '/assets/avatars/age-03-05-female.png',
  male03To05: '/assets/avatars/age-03-05-male.png',
  female06To08: '/assets/avatars/age-06-08-female.png',
  male06To08: '/assets/avatars/age-06-08-male.png',
  female09To12: '/assets/avatars/age-09-12-female.png',
  male09To12: '/assets/avatars/age-09-12-male.png',
  female13To17: '/assets/avatars/age-13-17-female.png',
  male13To17: '/assets/avatars/age-13-17-male.png',
  female18To29: '/assets/avatars/age-18-29-female.png',
  male18To29: '/assets/avatars/age-18-29-male.png',
  female30To49: '/assets/avatars/age-30-49-female.png',
  male30To49: '/assets/avatars/age-30-49-male.png',
  female50To64: '/assets/avatars/age-50-64-female.png',
  male50To64: '/assets/avatars/age-50-64-male.png',
  female65To79: '/assets/avatars/age-65-79-female.png',
  male65To79: '/assets/avatars/age-65-79-male.png',
  female80Plus: '/assets/avatars/age-80-plus-female.png',
  male80Plus: '/assets/avatars/age-80-plus-male.png'
}

type AvatarVoice = {
  avatarUrl?: string
  name?: string
  ageYears?: number
  gender?: string
  clipStartMs?: number
  clipEndMs?: number
}

function voiceLabel(voice: AvatarVoice): string {
  return String(voice.name || '').trim()
}

export function resolveVoiceAvatar(voice: AvatarVoice): string {
  if (voice.avatarUrl) return voice.avatarUrl

  const label = voiceLabel(voice)
  const ageYears = Number(voice.ageYears)
  const gender = String(voice.gender || '').toUpperCase()

  if (Number.isFinite(ageYears) && (gender === 'FEMALE' || gender === 'MALE')) {
    const female = gender === 'FEMALE'
    if (ageYears < 3) return female ? DEFAULT_AVATARS.female00To02 : DEFAULT_AVATARS.male00To02
    if (ageYears < 6) return female ? DEFAULT_AVATARS.female03To05 : DEFAULT_AVATARS.male03To05
    if (ageYears < 9) return female ? DEFAULT_AVATARS.female06To08 : DEFAULT_AVATARS.male06To08
    if (ageYears < 13) return female ? DEFAULT_AVATARS.female09To12 : DEFAULT_AVATARS.male09To12
    if (ageYears < 18) return female ? DEFAULT_AVATARS.female13To17 : DEFAULT_AVATARS.male13To17
    if (ageYears < 30) return female ? DEFAULT_AVATARS.female18To29 : DEFAULT_AVATARS.male18To29
    if (ageYears < 50) return female ? DEFAULT_AVATARS.female30To49 : DEFAULT_AVATARS.male30To49
    if (ageYears < 65) return female ? DEFAULT_AVATARS.female50To64 : DEFAULT_AVATARS.male50To64
    if (ageYears < 80) return female ? DEFAULT_AVATARS.female65To79 : DEFAULT_AVATARS.male65To79
    return female ? DEFAULT_AVATARS.female80Plus : DEFAULT_AVATARS.male80Plus
  }

  if (/奶奶|外婆|姥姥/.test(label)) return DEFAULT_AVATARS.female65To79
  if (/爷爷|外公|姥爷/.test(label)) return DEFAULT_AVATARS.male65To79
  if (/妈妈|母亲|阿姨/.test(label)) return DEFAULT_AVATARS.female30To49
  if (/爸爸|父亲|叔叔/.test(label)) return DEFAULT_AVATARS.male30To49
  if (/女儿|小雨|妹妹|姐姐|女孩/.test(label)) return DEFAULT_AVATARS.female06To08
  if (/儿子|弟弟|哥哥|男孩/.test(label)) return DEFAULT_AVATARS.male06To08

  return DEFAULT_AVATARS.female30To49
}

export function resolveVoiceDurationLabel(voice: AvatarVoice): string {
  if (!Number.isFinite(voice.clipStartMs) || !Number.isFinite(voice.clipEndMs)) return ''
  const duration = Number(voice.clipEndMs) - Number(voice.clipStartMs)
  if (duration <= 0) return ''
  return formatDurationMs(duration)
}
