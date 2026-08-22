import { Avatar } from '../shared/Avatar';
import { AvatarUploader } from './AvatarUploader';
import { TierBadge } from './TierBadge';
import { formatDate, shortAddress } from '../../lib/format';
import type { ProfileIdentity, TierProgress } from '../../types';

/**
 * Doc 11 — the identity block at the top of a profile.
 *
 * Own profile gets the uploader and the full wallet address; a public profile gets
 * a plain avatar and only a shortened address. The two are one component because
 * they are the same design, and letting them drift would be how a balance or a
 * full address eventually appears on the public page.
 */
export function ProfileHeader({
  identity,
  tier,
  isYou,
  onAvatarChanged,
}: {
  identity: ProfileIdentity;
  tier: TierProgress;
  isYou: boolean;
  onAvatarChanged?: () => void;
}) {
  const name =
    identity.username ??
    identity.label ??
    (identity.walletAddress ? shortAddress(identity.walletAddress) : identity.walletShort) ??
    'Player';

  const address = identity.walletAddress ?? identity.walletShort ?? '';

  return (
    <div className="relative flex flex-col items-center gap-5 overflow-hidden rounded-[20px] border border-green-solid/[0.18] bg-[linear-gradient(135deg,rgba(34,197,94,0.10),transparent)] p-[clamp(20px,3vw,30px)] sm:flex-row sm:items-start">
      {isYou ? (
        <AvatarUploader size={92} onChanged={onAvatarChanged} />
      ) : (
        <Avatar
          src={identity.avatarUrl}
          name={name}
          // A public profile only ever receives the shortened address. <Avatar>
          // normalises every seed through shortAddress, so this produces exactly
          // the same gradient as the full address does on the owner's own page.
          address={identity.walletShort}
          size={92}
          radiusRatio={0.28}
        />
      )}

      <div className="min-w-0 flex-1 text-center sm:text-left">
        <div className="flex flex-wrap items-center justify-center gap-2.5 sm:justify-start">
          <h2 className="truncate text-[clamp(19px,2.4vw,25px)] font-extrabold">{name}</h2>
          <TierBadge tier={tier.key} label={tier.label} />
          {isYou && <span className="text-[11.5px] font-bold text-green">you</span>}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[12.5px] text-muted sm:justify-start">
          {!identity.username && isYou && <span className="text-faint">No name set yet</span>}
          <span>Joined {formatDate(identity.joinedAt)}</span>
        </div>

        <p
          className="mt-2.5 font-mono text-[clamp(10.5px,1.4vw,12.5px)] break-all text-faint"
          title={isYou ? 'Your wallet address' : undefined}
        >
          {address}
        </p>
      </div>
    </div>
  );
}
