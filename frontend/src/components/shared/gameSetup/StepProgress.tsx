/** Segmented step indicator — replaces the old plain "Step N — ..." text with a visible progress bar. */
export function StepProgress({
  total,
  currentIndex,
  accentColor,
}: {
  total: number;
  currentIndex: number;
  accentColor: string;
}) {
  return (
    <div
      className="mb-5 flex items-center gap-1.5"
      role="progressbar"
      aria-valuenow={currentIndex + 1}
      aria-valuemin={1}
      aria-valuemax={total}
    >
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${i < currentIndex ? 'opacity-60' : ''}`}
          style={{ background: i <= currentIndex ? accentColor : 'var(--border2)' }}
        />
      ))}
    </div>
  );
}
