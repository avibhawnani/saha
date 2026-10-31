import { useEffect, useState } from "react";
import { Wordmark } from "./Wordmark";
import { ASK_FIELD_ID } from "./AskBar";
import { Button } from "./ui";
import "./Navbar.css";

/* Order must match the order of the sections down the page, or the scroll-spy
   marker appears to jump backwards as you scroll. */
const LINKS = [
  { id: "map", label: "Map" },
  { id: "how", label: "How it works" },
  { id: "coverage", label: "Coverage" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  /* Scroll-spy. The nav is small enough that an active marker is the only
     orientation cue it can afford, so it is worth observing sections rather
     than guessing from scroll position. The top band is discounted by the
     pill's own height so a section counts as current once it clears it. */
  useEffect(() => {
    const sections = LINKS.map((l) => document.getElementById(l.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (sections.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        setActive(visible.length > 0 ? visible[0].target.id : null);
      },
      { rootMargin: "-88px 0px -62% 0px" },
    );

    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  /* The primary action of a search product is to search, so the CTA puts the
     cursor in the ask field rather than navigating somewhere. It was a button
     with no handler before this. */
  const focusAsk = () => {
    setOpen(false);
    const field = document.getElementById(ASK_FIELD_ID);
    field?.scrollIntoView({ behavior: "smooth", block: "center" });
    /* Focus after the smooth scroll settles, or the browser jumps instead. */
    window.setTimeout(() => field?.focus({ preventScroll: true }), 420);
  };

  /* Escape closes the mobile sheet — a disclosure that can only be dismissed
     by the button it came from is a trap on a phone. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>

      <header className="nav">
        <div className="nav__pill">
          <a className="nav__brand" href="#top" aria-label="saha home">
            <Wordmark />
          </a>

          <nav className="nav__links" aria-label="Main">
            {LINKS.map((l) => (
              <a
                key={l.id}
                className={active === l.id ? "nav__link nav__link--active" : "nav__link"}
                href={`#${l.id}`}
                aria-current={active === l.id ? "true" : undefined}
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="nav__cta">
            <Button tone="primary" onClick={focusAsk}>
              Search
            </Button>
          </div>

          <button
            type="button"
            className="nav__burger"
            aria-expanded={open}
            aria-controls="nav-sheet"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="sr">{open ? "Close menu" : "Open menu"}</span>
            <span className={open ? "burger burger--x" : "burger"} aria-hidden="true">
              <i />
              <i />
            </span>
          </button>
        </div>

        {/* Mobile disclosure — its own pane of glass below the pill, so the two
            read as stacked sheets rather than one growing blob. */}
        <div id="nav-sheet" className={open ? "sheet sheet--open" : "sheet"} inert={!open}>
          <nav className="sheet__inner" aria-label="Mobile">
            {LINKS.map((l) => (
              <a
                key={l.id}
                className="sheet__link"
                href={`#${l.id}`}
                onClick={() => setOpen(false)}
              >
                {l.label}
              </a>
            ))}
            <Button tone="primary" size="lg" onClick={focusAsk}>
              Search
            </Button>
          </nav>
        </div>
      </header>
    </>
  );
}
