import { WORDMARK_STROKES } from './wordmark-strokes.ts';

/** Monoline chalk lettering for "chalkline", drawn as strokes so it can animate in. */
interface Props {
  className?: string;
  /** Draw the letters in one stroke at a time; ignored under reduced motion via CSS. */
  animate?: boolean;
  title?: string;
}

export function Wordmark({ className, animate = false, title = 'Chalkline' }: Props) {
  return (
    <svg
      className={`wordmark${animate ? ' wordmark-animate' : ''}${className ? ` ${className}` : ''}`}
      viewBox="-4 0 182 46"
      role="img"
      aria-label={title}
    >
      {WORDMARK_STROKES.map((d, i) => (
        <path
          key={d}
          d={d}
          pathLength={1}
          style={animate ? { animationDelay: `${120 + i * 110}ms` } : undefined}
        />
      ))}
    </svg>
  );
}

/** The app mark: the chalk "c" from the wordmark on a slate tile, with a butter-yellow dot. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="2" y="2" width="60" height="60" rx="16" fill="#21352e" />
      <rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx="16"
        fill="none"
        stroke="#f4f1e8"
        strokeOpacity="0.14"
        strokeWidth="2"
      />
      <path
        d="M40.5 21.5A14.5 14.5 0 1 0 40.5 42.5"
        fill="none"
        stroke="#f4f1e8"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <circle cx="50" cy="44.5" r="4.4" fill="#f3df94" />
    </svg>
  );
}
