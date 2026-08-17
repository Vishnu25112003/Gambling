/**
 * A deterministic colour for a wallet.
 *
 * The design used one fixed purple-to-blue gradient for every account, which
 * makes the avatar decoration rather than identification. Deriving the hue from
 * the address means the same wallet is always the same colour — so a player can
 * tell at a glance that the account in the top bar is the one they expect,
 * which matters when the label itself is a truncated string of base58.
 *
 * Not a security control: two addresses can collide on a hue. It is a
 * recognition aid on top of the address, never a substitute for reading it.
 */
export function avatarHue(address: string): number {
  let hash = 0;
  for (let i = 0; i < address.length; i += 1) {
    hash = (hash * 31 + address.charCodeAt(i)) % 360;
  }
  return hash;
}

export function avatarGradient(address: string): string {
  const hue = avatarHue(address);
  return `linear-gradient(135deg, hsl(${hue} 68% 55%), hsl(${(hue + 48) % 360} 68% 42%))`;
}
