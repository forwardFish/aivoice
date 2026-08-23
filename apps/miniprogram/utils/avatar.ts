import { formatDurationMs } from './format'

const DEFAULT_AVATARS = {
  childGirl: '/assets/avatars/child-girl-01.png',
  childBoy: '/assets/avatars/child-boy-01.png',
  woman: '/assets/avatars/woman-01.png',
  man: '/assets/avatars/man-01.png',
  grandma: '/assets/avatars/grandma-01.png',
  grandpa: '/assets/avatars/grandpa-01.png'
}

type AvatarVoice = {
  avatarUrl?: string
  name?: string
  clipStartMs?: number
  clipEndMs?: number
}

function voiceLabel(voice: AvatarVoice): string {
  return String(voice.name || '').trim()
}

export function resolveVoiceAvatar(voice: AvatarVoice): string {
  if (voice.avatarUrl) return voice.avatarUrl

  const label = voiceLabel(voice)

  if (/奶奶|外婆|姥姥/.test(label)) return DEFAULT_AVATARS.grandma
  if (/爷爷|外公|姥爷/.test(label)) return DEFAULT_AVATARS.grandpa
  if (/妈妈|母亲|阿姨/.test(label)) return DEFAULT_AVATARS.woman
  if (/爸爸|父亲|叔叔/.test(label)) return DEFAULT_AVATARS.man
  if (/女儿|小雨|妹妹|姐姐|女孩/.test(label)) return DEFAULT_AVATARS.childGirl
  if (/儿子|弟弟|哥哥|男孩/.test(label)) return DEFAULT_AVATARS.childBoy

  return DEFAULT_AVATARS.woman
}

export function resolveVoiceDurationLabel(voice: AvatarVoice): string {
  if (!Number.isFinite(voice.clipStartMs) || !Number.isFinite(voice.clipEndMs)) return ''
  const duration = Number(voice.clipEndMs) - Number(voice.clipStartMs)
  if (duration <= 0) return ''
  return formatDurationMs(duration)
}
