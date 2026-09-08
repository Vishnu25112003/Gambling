const SUBTITLE = 'Reach the team, or read the devnet play guide.';

/** No support ticketing or docs backend exists yet — matches the mockup's own sparse "Support" placeholder exactly. */
export function Support() {
  return (
    <>
      <h1 className="mt-1 mb-1.5 font-heading text-[clamp(26px,3.4vw,40px)] font-bold text-[#f2fff8]">
        SUPPORT
      </h1>
      <p className="mb-5 text-sm text-muted">{SUBTITLE}</p>

      <div
        className="rounded-[18px] border border-dashed py-[70px] text-center"
        style={{ borderColor: 'rgba(47,224,138,.2)', background: 'var(--panel-bg)' }}
      >
        <div
          className="mx-auto mb-4 size-11 rotate-45 rounded-lg border-[1.5px]"
          style={{ borderColor: 'rgba(47,224,138,.3)' }}
        />
        <div className="font-heading text-[18px] font-bold tracking-[0.06em] text-[#eafff3]">
          NOTHING HERE YET
        </div>
        <p className="mt-2 text-[13.5px] text-muted">
          This screen fills in once the first season matches settle.
        </p>
      </div>
    </>
  );
}
