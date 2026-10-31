import "./Wordmark.css";

/** Three circles sharing their overlaps — सह, "together". */
export function Wordmark({ inverse = false }: { inverse?: boolean }) {
  return (
    <span className={inverse ? "wordmark wordmark--inverse" : "wordmark"}>
      <svg className="wordmark__mark" viewBox="0 0 28 26" aria-hidden="true">
        <g style={{ mixBlendMode: "multiply" }}>
          <circle cx="14" cy="8.5" r="7.5" fill="var(--saffron)" />
          <circle cx="8" cy="17.5" r="7.5" fill="var(--clay)" opacity="0.85" />
          <circle cx="20" cy="17.5" r="7.5" fill="var(--jade)" opacity="0.8" />
        </g>
      </svg>
      <span className="wordmark__text">saha</span>
    </span>
  );
}
