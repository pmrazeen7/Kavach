import Character, { type CharacterId, type Pose } from './Character'

/** Kept as the app-wide shorthand: Kavi by default. */
export type MascotPose = Pose

export default function Mascot({ pose = 'idle', size = 120, who = 'kavi' }: { pose?: Pose; size?: number; who?: CharacterId }) {
  return <Character who={who} pose={pose} size={size} />
}
