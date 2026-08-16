import { EmptyState, PageTitle } from '../../components/shared/ui';
import { Icon } from '../../components/shared/icons';
import { NAV_ITEMS, PLACEHOLDER_COPY } from '../../components/dashboard/nav';

/**
 * The design's shared empty section, used by every sidebar entry that has no
 * backend behind it yet (My Bets, Rewards, Affiliates, Support). Title and
 * icon come from the sidebar definition so the two can never drift apart.
 */
export function Placeholder({ navKey }: { navKey: string }) {
  const item = NAV_ITEMS.find((n) => n.key === navKey);

  return (
    <>
      <PageTitle title={item?.label ?? 'Dashboard'} subtitle={PLACEHOLDER_COPY[navKey] ?? ''} />
      <EmptyState
        icon={<Icon name={item?.icon ?? 'home'} size={19} />}
        scaleIcon
        title="Nothing here yet"
        body="This section fills in once the first games go live."
      />
    </>
  );
}
