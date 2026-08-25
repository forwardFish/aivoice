export interface VoiceAvatarProfile {
  id: string
  name?: string
  avatarUrl?: string
}

const DEFAULT_AVATARS = {
  childGirl: '/assets/avatars/avatar-child-girl.png',
  childBoy: '/assets/avatars/avatar-child-boy.png',
  mother: '/assets/avatars/avatar-mother.png',
  father: '/assets/avatars/avatar-father.png',
  grandma: '/assets/avatars/avatar-grandma.png',
  grandpa: '/assets/avatars/avatar-grandpa.png'
} as const

function relationLabel(profile: VoiceAvatarProfile): string {
  return String(profile.name || '').trim()
}

export function resolveVoiceAvatar(profile: VoiceAvatarProfile): string {
  const customAvatar = String(profile.avatarUrl || '').trim()
  if (customAvatar) return customAvatar

  const label = relationLabel(profile)
  if (/奶奶|外婆|姥姥/.test(label)) return DEFAULT_AVATARS.grandma
  if (/爷爷|外公|姥爷/.test(label)) return DEFAULT_AVATARS.grandpa
  if (/妈妈|母亲|妈咪/.test(label)) return DEFAULT_AVATARS.mother
  if (/爸爸|父亲|爸比/.test(label)) return DEFAULT_AVATARS.father
  if (/女儿|女孩/.test(label)) return DEFAULT_AVATARS.childGirl
  if (/儿子|男孩/.test(label)) return DEFAULT_AVATARS.childBoy
  return ''
}

