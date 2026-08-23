export interface VoiceAvatarProfile {
  id: string
  name?: string
  avatarUrl?: string
  age?: number
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

function parseAge(label: string, explicitAge?: number): number | undefined {
  if (Number.isFinite(explicitAge)) return Number(explicitAge)
  const match = label.match(/(\d{1,2})\s*岁/)
  if (!match) return undefined
  const age = Number(match[1])
  return Number.isFinite(age) ? age : undefined
}

export function resolveVoiceAvatar(profile: VoiceAvatarProfile): string {
  const customAvatar = String(profile.avatarUrl || '').trim()
  if (customAvatar) return customAvatar

  const label = relationLabel(profile)
  const age = parseAge(label, profile.age)
  if (/奶奶|外婆|姥姥/.test(label)) return DEFAULT_AVATARS.grandma
  if (/爷爷|外公|姥爷/.test(label)) return DEFAULT_AVATARS.grandpa
  if (/妈妈|母亲|妈咪/.test(label)) return DEFAULT_AVATARS.mother
  if (/爸爸|父亲|爸比/.test(label)) return DEFAULT_AVATARS.father
  if (/女儿|女孩/.test(label)) return DEFAULT_AVATARS.childGirl
  if (/儿子|男孩/.test(label)) return DEFAULT_AVATARS.childBoy
  if (age != null && age <= 14) {
    if (/儿|子|弟|哥|男/.test(label)) return DEFAULT_AVATARS.childBoy
    return DEFAULT_AVATARS.childGirl
  }
  if (age != null && age >= 60) {
    if (/爷|公|男/.test(label)) return DEFAULT_AVATARS.grandpa
    return DEFAULT_AVATARS.grandma
  }
  if (/奶|婆|姨|姐|妹|妈|女/.test(label)) return DEFAULT_AVATARS.mother
  if (/爷|公|叔|伯|哥|弟|爸|男/.test(label)) return DEFAULT_AVATARS.father
  return ''
}

