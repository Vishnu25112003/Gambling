import { Card, EmptyState, PageTitle } from '../../components/shared/ui';
import { Icon } from '../../components/shared/icons';

const SUBTITLE = 'Reach the team, or read the devnet play guide.';

/** No support ticketing or docs backend exists yet — a static contact card and the shared empty state. */
export function Support() {
  return (
    <>
      <PageTitle title="Support" subtitle={SUBTITLE} />

      <Card className="mb-[18px] flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <div className="font-heading text-[15px] font-bold">Need a hand?</div>
          <p className="mt-1 text-[13px] text-muted">
            Email the team and we'll get back to you — devnet is actively monitored.
          </p>
        </div>
        <a
          href="mailto:support@infinit-respawn.app"
          className="shrink-0 rounded-[10px] border border-line bg-line2 px-4 py-2.5 text-[13px] font-semibold text-text transition hover:brightness-110"
        >
          support@infinit-respawn.app
        </a>
      </Card>

      <EmptyState
        icon={<Icon name="help" size={19} />}
        scaleIcon
        title="Nothing here yet"
        body="A help centre and devnet play guide land here once the first season is live."
      />
    </>
  );
}
