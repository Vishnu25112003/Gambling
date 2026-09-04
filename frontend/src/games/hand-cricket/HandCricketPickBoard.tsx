import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Heart } from 'lucide-react';
import { HandsDuelCanvas } from './HandsDuelCanvas';

export interface BallReveal {
  batterPick: number;
  bowlerPick: number;
  runsScored: number;
  out: boolean;
}

export interface FinishedInningsSummary {
  label: string;
  myRuns: number;
  opponentRuns: number;
}

interface HandCricketPickBoardProps {
  isSuperOver: boolean;
  /** Whichever player created the match — fixed for its whole lifetime, so
   * the blue/red hands and scorecards can stay put instead of swapping
   * sides depending on who's looking at the screen. */
  isHost: boolean;
  myRole: 'batting' | 'bowling';
  myRuns: number;
  opponentRuns: number;
  ballsPerInnings: number;
  finishedInnings: FinishedInningsSummary[];
  ballNumber: number;
  pickTimeLeft: number;
  myLives: number;
  opponentLives: number;
  mySubmitted: boolean;
  reveal: BallReveal | null;
  /** Set for 2.5s between a resolved ball and the next one starting — see
   * HandCricketBoard's BALL_STARTED handler. */
  nextRoundNumber: number | null;
  onPick: (n: 1 | 2 | 3 | 4 | 5 | 6) => void;
}

const PICKS = [1, 2, 3, 4, 5, 6] as const;
const LUCKIEST = "'Luckiest Guy', cursive";

/**
 * Exact reskin of the Hand Cricket design handoff (`Hand Cricket.dc.html`):
 * same stadium-at-dusk background art, scoreboard cards, hand-sign stage
 * and number pad, pixel-for-pixel where the design specifies a value. The
 * design's CPU-opponent demo had no timer/lives/innings-history HUD (a
 * single-player prototype doesn't need one); those are added as small
 * chips in the same visual language rather than dropped, since the real
 * 1v1 match still needs them.
 */
export function HandCricketPickBoard({
  isSuperOver,
  isHost,
  myRole,
  myRuns,
  opponentRuns,
  ballsPerInnings,
  finishedInnings,
  ballNumber,
  pickTimeLeft,
  myLives,
  opponentLives,
  mySubmitted,
  reveal,
  nextRoundNumber,
  onPick,
}: HandCricketPickBoardProps) {
  const isBatting = myRole === 'batting';
  const otherRole: 'batting' | 'bowling' = isBatting ? 'bowling' : 'batting';
  const locked = mySubmitted || reveal !== null;
  const shaking = mySubmitted && !reveal;

  // The server only reveals both signs once the opponent has also picked —
  // but a player knows their own sign the instant they tap it, so it shows
  // on their own hand right away instead of waiting on the round trip.
  const [myPick, setMyPick] = useState<number | null>(null);
  useEffect(() => {
    setMyPick(null);
  }, [ballNumber, isSuperOver]);

  const myPickPose = reveal ? (isBatting ? reveal.batterPick : reveal.bowlerPick) : (myPick ?? 0);
  const opponentPickPose = reveal ? (isBatting ? reveal.bowlerPick : reveal.batterPick) : 0;

  // Host is always the blue/left hand and card, the joiner always red/right
  // — fixed by who created the match, not by who's currently looking.
  const leftPose = isHost ? myPickPose : opponentPickPose;
  const rightPose = isHost ? opponentPickPose : myPickPose;
  const hostLabel = isHost ? 'You' : 'Opponent';
  const joinerLabel = isHost ? 'Opponent' : 'You';
  const hostRuns = isHost ? myRuns : opponentRuns;
  const joinerRuns = isHost ? opponentRuns : myRuns;
  const hostRole = isHost ? myRole : otherRole;
  const joinerRole = isHost ? otherRole : myRole;
  const hostLives = isHost ? myLives : opponentLives;
  const joinerLives = isHost ? opponentLives : myLives;

  const timerColor = pickTimeLeft <= 3 ? '#ff8f92' : pickTimeLeft <= 6 ? '#ffe9a8' : '#cfe8ff';

  const statusLine = reveal
    ? reveal.out
      ? isBatting
        ? 'OUT! Your innings ends here.'
        : `WICKET! You bowled them out.`
      : isBatting
        ? `You scored ${reveal.runsScored} run${reveal.runsScored === 1 ? '' : 's'}.`
        : `They scored ${reveal.runsScored} run${reveal.runsScored === 1 ? '' : 's'}.`
    : locked
      ? 'Waiting for opponent to pick…'
      : isBatting
        ? 'Pick your shot — 1 to 6'
        : 'Pick your delivery — 1 to 6';

  const padHint = locked ? 'sign locked in' : isBatting ? 'pick your shot' : 'pick your delivery';

  function handlePick(n: (typeof PICKS)[number]) {
    if (locked) return;
    setMyPick(n);
    onPick(n);
  }

  return (
    <div
      className="relative mx-auto flex w-full flex-col overflow-hidden"
      style={{
        maxWidth: 540,
        aspectRatio: '3 / 5',
        borderRadius: 26,
        boxShadow: '0 18px 40px rgba(0,0,0,.35)',
        background: 'linear-gradient(#8fd0f5 0%,#b6e2fb 34%,#d5eefc 52%)',
        fontFamily: "'Baloo 2', system-ui, sans-serif",
      }}
    >
      <StadiumBackdrop />

      {/* Header: title + scoreboard + status */}
      <div className="relative flex flex-col items-center gap-[7px] px-3.5 pt-2 pb-1.5">
        <div className="flex items-center gap-2">
          <Pill background="#fff" border="#1a3f7a" color="#1a3f7a">
            Hand Cricket
          </Pill>
          <Pill background="rgba(14,32,57,.85)" border="transparent" color={timerColor}>
            Ball {ballNumber}/{ballsPerInnings} · {pickTimeLeft}s
          </Pill>
        </div>

        {(isSuperOver || finishedInnings.length > 0) && (
          <div className="flex max-w-full flex-wrap items-center justify-center gap-1.5">
            {isSuperOver && (
              <Pill background="rgba(14,32,57,.82)" border="transparent" color="#ffe9a8">
                Super Over — scores were tied
              </Pill>
            )}
            {finishedInnings.map((inn) => (
              <Pill key={inn.label} background="rgba(14,32,57,.82)" border="transparent" color="#cfe8ff">
                {inn.label}: You {inn.myRuns} · Opp {inn.opponentRuns}
              </Pill>
            ))}
          </div>
        )}

        <div className="flex w-full items-stretch justify-between gap-2.5">
          <ScoreCard label={hostLabel} runs={hostRuns} role={hostRole} tone="blue" />
          <div
            className="flex items-center"
            style={{ fontFamily: LUCKIEST, fontSize: 18, color: '#fff', textShadow: '0 3px 0 #1a3f7a' }}
          >
            VS
          </div>
          <ScoreCard label={joinerLabel} runs={joinerRuns} role={joinerRole} tone="red" />
        </div>

        <div className="flex w-full items-center justify-between px-1">
          <LivesRow lives={hostLives} />
          <LivesRow lives={joinerLives} reversed />
        </div>

        <div
          className="text-center font-bold"
          style={{
            maxWidth: '96%',
            padding: '5px 14px',
            borderRadius: 14,
            background: 'rgba(14,32,57,.82)',
            color: '#ffe9a8',
            fontSize: 12,
            lineHeight: 1.35,
          }}
        >
          {statusLine}
        </div>
      </div>

      {/* Hand-sign stage */}
      <div className="relative" style={{ flex: '1 1 auto', minHeight: 290 }}>
        <HandsDuelCanvas leftPose={leftPose} rightPose={rightPose} shaking={shaking} />

        <div
          className="pointer-events-none absolute right-0 bottom-1.5 left-0 flex justify-between"
          style={{ padding: '0 14%' }}
        >
          <NumberReadout value={leftPose} shadow="#1a3f7a" reveal={reveal !== null} />
          <NumberReadout value={rightPose} shadow="#9c1f26" reveal={reveal !== null} />
        </div>

        <div
          className="pointer-events-none absolute rounded-full"
          style={{
            left: '50%',
            top: 16,
            marginLeft: -19,
            width: 38,
            height: 38,
            background: 'radial-gradient(circle at 34% 30%,#ff8484,#c11a1a 60%,#7d0d0d)',
            border: '3px solid #5a0a0a',
            boxShadow: '0 8px 10px rgba(0,0,0,.25)',
            animation: 'hcFloatBall 3.2s ease-in-out infinite',
          }}
        />

        {reveal?.out && (
          <div
            className="absolute inset-0 flex items-center justify-center p-6"
            style={{ background: 'rgba(9,24,44,.78)' }}
          >
            <div
              className="flex w-full flex-col items-center gap-3.5 text-center"
              style={{
                animation: 'hcPopIn .35s ease-out',
                maxWidth: 380,
                padding: '26px 22px',
                borderRadius: 26,
                background: 'linear-gradient(#ffffff,#e8f3ff)',
                border: '6px solid #1a3f7a',
                boxShadow: '0 12px 0 #102b52',
              }}
            >
              <div style={{ fontFamily: LUCKIEST, fontSize: 29, color: '#12305e', lineHeight: 1.1 }}>
                {isBatting ? 'OUT! 🎯' : 'WICKET! 🎉'}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#4a6f96' }}>
                {isBatting
                  ? `You made ${myRuns}. Now defend it.`
                  : `They made ${opponentRuns}. Bowled them out.`}
              </div>
            </div>
          </div>
        )}

        {nextRoundNumber !== null && (
          <div
            className="absolute inset-0 flex items-center justify-center p-6"
            style={{ background: 'rgba(9,24,44,.78)' }}
          >
            <div
              className="flex w-full flex-col items-center gap-2 text-center"
              style={{
                animation: 'hcPopIn .35s ease-out',
                maxWidth: 340,
                padding: '22px 26px',
                borderRadius: 26,
                background: 'linear-gradient(#ffffff,#e8f3ff)',
                border: '6px solid #1a3f7a',
                boxShadow: '0 12px 0 #102b52',
              }}
            >
              <div style={{ fontFamily: LUCKIEST, fontSize: 26, color: '#12305e', lineHeight: 1.1 }}>
                Round {nextRoundNumber}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#4a6f96' }}>Get ready for the next ball…</div>
            </div>
          </div>
        )}
      </div>

      {/* Number pad */}
      <div
        className="relative flex flex-col gap-1.5 px-3 pt-2 pb-3"
        style={{ background: 'linear-gradient(rgba(14,32,57,0),rgba(14,32,57,.9) 24%)' }}
      >
        <div
          className="self-center font-extrabold uppercase"
          style={{
            padding: '3px 14px',
            borderRadius: 999,
            background: 'rgba(14,32,57,.85)',
            fontSize: 12,
            letterSpacing: 2,
            color: '#cfe8ff',
          }}
        >
          {padHint}
        </div>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(6,1fr)' }}>
          {PICKS.map((n) => (
            <button
              key={n}
              type="button"
              disabled={locked}
              onClick={() => handlePick(n)}
              className="hc-num-btn"
              style={{
                cursor: locked ? 'not-allowed' : 'pointer',
                fontFamily: LUCKIEST,
                fontSize: 22,
                padding: '8px 0 10px',
                borderRadius: 14,
                border: '3px solid #1a3f7a',
                background: 'linear-gradient(#ffffff,#dceaff)',
                color: '#12305e',
                boxShadow: '0 4px 0 #1a3f7a',
                opacity: locked ? 0.45 : 1,
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Pill({
  children,
  background,
  border,
  color,
}: {
  children: ReactNode;
  background: string;
  border: string;
  color: string;
}) {
  return (
    <div
      className="font-extrabold uppercase"
      style={{
        padding: '3px 12px',
        borderRadius: 999,
        background,
        border: border === 'transparent' ? undefined : `2px solid ${border}`,
        fontSize: 11,
        letterSpacing: 1.6,
        color,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </div>
  );
}

function ScoreCard({
  label,
  runs,
  role,
  tone,
}: {
  label: string;
  runs: number;
  role: 'batting' | 'bowling';
  tone: 'blue' | 'red';
}) {
  const c =
    tone === 'blue'
      ? { border: '#1a3f7a', bg: 'linear-gradient(#ffffff,#e4f1ff)', label: '#2f6fd4', runs: '#12305e', role: '#6b8fb8' }
      : { border: '#9c1f26', bg: 'linear-gradient(#ffffff,#ffe6e6)', label: '#d93b3f', runs: '#6d151b', role: '#c08287' };
  return (
    <div
      className="flex flex-1 flex-col items-center gap-px"
      style={{
        padding: '5px 8px 6px',
        borderRadius: 14,
        background: c.bg,
        border: `3px solid ${c.border}`,
        boxShadow: `0 3px 0 ${c.border}`,
      }}
    >
      <div className="font-extrabold uppercase" style={{ fontSize: 12, letterSpacing: 1, color: c.label }}>
        {label}
      </div>
      <div style={{ fontFamily: LUCKIEST, fontSize: 26, lineHeight: 1.05, color: c.runs }}>{runs}</div>
      <div className="font-bold uppercase" style={{ fontSize: 11, letterSpacing: 1, color: c.role }}>
        {role}
      </div>
    </div>
  );
}

function LivesRow({ lives, reversed = false }: { lives: number; reversed?: boolean }) {
  return (
    <div className={`flex gap-1 ${reversed ? 'flex-row-reverse' : ''}`}>
      {Array.from({ length: 3 }).map((_, i) => (
        <Heart key={i} className="size-3.5 fill-red text-red" style={{ opacity: i < lives ? 1 : 0.25 }} />
      ))}
    </div>
  );
}

function NumberReadout({ value, shadow, reveal }: { value: number; shadow: string; reveal: boolean }) {
  return (
    <div
      className="text-center"
      style={{
        minWidth: 56,
        fontFamily: LUCKIEST,
        fontSize: 34,
        color: '#fff',
        textShadow: `0 4px 0 ${shadow}`,
        animation: reveal ? 'hcNumPop .35s ease-out' : undefined,
      }}
    >
      {value ? value : ''}
    </div>
  );
}

function StadiumBackdrop() {
  const abs: CSSProperties = { position: 'absolute' };
  return (
    <>
      <div style={{ ...abs, top: 0, left: 0, right: 0, bottom: '34%', background: 'linear-gradient(#5aa9e6 0%,#8fd0f5 46%,#cbe9fb 100%)' }} />
      <div
        style={{
          ...abs,
          left: '50%',
          top: '6%',
          transform: 'translateX(-50%)',
          width: 340,
          height: 200,
          borderRadius: '50%',
          background: 'radial-gradient(closest-side,rgba(255,252,232,.85),rgba(255,252,232,0))',
        }}
      />
      <div style={{ ...abs, left: '6%', top: '9%', width: 120, height: 34, borderRadius: 999, background: 'rgba(255,255,255,.6)', filter: 'blur(4px)' }} />
      <div style={{ ...abs, right: '4%', top: '16%', width: 88, height: 26, borderRadius: 999, background: 'rgba(255,255,255,.45)', filter: 'blur(4px)' }} />

      <div style={{ ...abs, left: '9%', top: '34%', width: 8, height: '14%', background: 'linear-gradient(90deg,#37527d,#5a7bab)' }} />
      <div
        style={{
          ...abs,
          left: '5%',
          top: '30.5%',
          width: 62,
          height: 26,
          borderRadius: 7,
          background: 'linear-gradient(#eef6ff,#b9cde6)',
          border: '2px solid #37527d',
          boxShadow: '0 0 22px rgba(255,250,220,.85)',
        }}
      />
      <div style={{ ...abs, right: '9%', top: '34%', width: 8, height: '14%', background: 'linear-gradient(90deg,#5a7bab,#37527d)' }} />
      <div
        style={{
          ...abs,
          right: '5%',
          top: '30.5%',
          width: 62,
          height: 26,
          borderRadius: 7,
          background: 'linear-gradient(#eef6ff,#b9cde6)',
          border: '2px solid #37527d',
          boxShadow: '0 0 22px rgba(255,250,220,.85)',
        }}
      />

      <div
        style={{
          ...abs,
          left: '-10%',
          right: '-10%',
          top: '40%',
          height: '30%',
          borderRadius: '50% 50% 0 0/86% 86% 0 0',
          background: 'linear-gradient(#44649b 0%,#375888 40%,#2b4670 100%)',
        }}
      />
      <div style={{ ...abs, left: '-10%', right: '-10%', top: '40%', height: '30%', borderRadius: '50% 50% 0 0/86% 86% 0 0', overflow: 'hidden' }}>
        <div
          style={{
            ...abs,
            left: 0,
            right: 0,
            top: '14%',
            height: '22%',
            background:
              'radial-gradient(closest-side,rgba(255,255,255,.5),rgba(255,255,255,0)) 0 0/7px 7px repeat,' +
              'radial-gradient(closest-side,rgba(255,214,120,.4),rgba(255,214,120,0)) 4px 4px/11px 9px repeat',
            opacity: 0.75,
          }}
        />
        <div style={{ ...abs, left: 0, right: 0, top: '36%', height: '5%', background: 'linear-gradient(rgba(255,255,255,.28),rgba(255,255,255,.08))' }} />
        <div
          style={{
            ...abs,
            left: 0,
            right: 0,
            top: '41%',
            height: '22%',
            background:
              'radial-gradient(closest-side,rgba(255,255,255,.42),rgba(255,255,255,0)) 0 0/8px 8px repeat,' +
              'radial-gradient(closest-side,rgba(180,215,255,.4),rgba(180,215,255,0)) 5px 4px/12px 10px repeat',
            opacity: 0.62,
          }}
        />
        <div style={{ ...abs, left: 0, right: 0, bottom: 0, height: '16%', background: 'linear-gradient(rgba(20,38,68,0),rgba(20,38,68,.45))' }} />
      </div>

      <div style={{ ...abs, left: '-10%', right: '-10%', top: '57%', height: '5%', background: 'linear-gradient(#f2f5fa,#cfd9e8)', borderTop: '2px solid rgba(26,63,122,.35)' }} />
      <div
        style={{
          ...abs,
          left: '-10%',
          right: '-10%',
          top: '57%',
          height: '5%',
          background: 'repeating-linear-gradient(90deg,rgba(26,63,122,.16) 0 42px,rgba(26,63,122,0) 42px 46px)',
        }}
      />

      <div
        style={{
          ...abs,
          left: '-20%',
          right: '-20%',
          top: '62%',
          bottom: 0,
          background: 'radial-gradient(130% 110% at 50% -10%,#7ed44a,#3f9d24 58%,#237216)',
        }}
      />
      <div
        style={{
          ...abs,
          left: '-20%',
          right: '-20%',
          top: '62%',
          bottom: 0,
          background: 'repeating-linear-gradient(180deg,rgba(255,255,255,.09) 0 18px,rgba(0,0,0,.05) 18px 36px)',
          opacity: 0.7,
        }}
      />
      <div style={{ ...abs, left: '-30%', right: '-30%', top: '61.4%', height: 8, background: '#f4f7fb', borderRadius: 999, boxShadow: '0 2px 0 rgba(0,0,0,.12)' }} />
      <div
        style={{
          ...abs,
          left: '50%',
          top: '70%',
          bottom: '-6%',
          width: '44%',
          transform: 'translateX(-50%)',
          background: 'linear-gradient(#d8c79c,#c9b485)',
          clipPath: 'polygon(34% 0,66% 0,100% 100%,0 100%)',
          opacity: 0.95,
        }}
      />
    </>
  );
}
