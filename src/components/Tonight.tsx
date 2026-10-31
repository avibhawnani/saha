import { Pill, Price, When } from "./ui";
import { DATASET, EVENTS, isOn, type SahaEvent } from "../data/events";
import { todayISO } from "../lib/date";
import "./Tonight.css";

/** Where an event is, phrased for a list rather than a map pin. */
function whereLabel(e: SahaEvent): string {
  if (e.placement === "remote") return "Online";
  if (e.placement === "city") return e.venue.city ?? "City only";
  return e.venue.area ?? e.venue.name ?? e.venueRaw;
}

/** On now first, then by start date. */
function order(a: SahaEvent, b: SahaEvent, today: string): number {
  const on = Number(isOn(b, today)) - Number(isOn(a, today));
  return on !== 0 ? on : a.startDate.localeCompare(b.startDate);
}

/**
 * The hero's preview. Shows the real listing rather than an abstract graphic —
 * saha displays what is on, so the list *is* the product.
 */
export function Tonight({ events = EVENTS, limit = 4 }: { events?: SahaEvent[]; limit?: number }) {
  const today = todayISO();
  const sorted = [...events].sort((a, b) => order(a, b, today));
  const onNow = events.filter((e) => isOn(e, today)).length;

  return (
    <div className="tonight">
      <div className="tonight__head">
        <div>
          <p className="tonight__head-label label">On in Delhi NCR</p>
          <p className="tonight__head-count">
            {onNow} on now <span className="tonight__head-of">of {events.length} listed</span>
          </p>
        </div>
        <Pill dot tone="jade">
          Live
        </Pill>
      </div>

      <ul className="tonight__list">
        {sorted.slice(0, limit).map((e) => (
          <li key={e.id} className={isOn(e, today) ? "row row--on" : "row"}>
            <div className="row__body">
              <p className="row__title">{e.title}</p>
              <When
                startDate={e.startDate}
                endDate={e.endDate}
                startTime={e.startTime}
                today={today}
              />
            </div>

            <div className="row__right">
              <p className="row__where">{whereLabel(e)}</p>
              <Price free={e.price.free} fromINR={e.price.fromINR} raw={e.price.raw} />
            </div>
          </li>
        ))}
      </ul>

      <p className="tonight__foot">
        {DATASET.region} · {DATASET.window} · read from live listings, not seeded
      </p>
    </div>
  );
}
