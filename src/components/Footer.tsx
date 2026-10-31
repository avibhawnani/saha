import { Wordmark } from "./Wordmark";
import { Button } from "./ui";
import "./Footer.css";

const YEAR = new Date().getFullYear();

const COLUMNS = [
  {
    head: "Product",
    links: ["Tonight near you", "Ask out loud", "The map", "Categories"],
  },
  {
    head: "Coverage",
    links: ["Cities", "Listing sources", "How saha reads a page", "Data gaps"],
  },
  {
    head: "Company",
    links: ["About saha", "Careers", "Press kit", "Contact"],
  },
];

export function Footer() {
  return (
    <footer className="foot">
      {/* The closing ask, carried on the footer's own dark ground so the page
          ends on one block of colour rather than trailing off. */}
      <div className="shell foot__cta">
        <div>
          <h2 className="foot__cta-title">Something is on eight minutes from you.</h2>
          <p className="foot__cta-sub">
            Say what you feel like. Saha shows you what is actually on, tonight, anywhere in
            India.
          </p>
        </div>
        <Button tone="primary" size="lg">
          Open the map
        </Button>
      </div>

      <div className="shell foot__grid">
        <div className="foot__brand">
          <Wordmark inverse />
          <p className="foot__tagline">
            सह — together. Voice-first discovery for whatever is on tonight, in any city in India,
            built for groups of three rather than crowds of three hundred.
          </p>
          <p className="foot__made">Made in India</p>
        </div>

        {COLUMNS.map((col) => (
          <nav key={col.head} className="foot__col" aria-label={col.head}>
            <p className="foot__head label">{col.head}</p>
            <ul className="foot__list">
              {col.links.map((l) => (
                <li key={l}>
                  <a className="foot__link" href="#top">
                    {l}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="shell foot__legal">
        <p className="foot__copy">© {YEAR} saha</p>
        <div className="foot__legal-links">
          <a className="foot__link" href="#top">
            Privacy
          </a>
          <a className="foot__link" href="#top">
            Terms
          </a>
          <a className="foot__link" href="#top">
            Safety
          </a>
        </div>
        <p className="foot__status">
          <span className="foot__status-dot" aria-hidden="true" />
          All systems normal
        </p>
      </div>
    </footer>
  );
}
