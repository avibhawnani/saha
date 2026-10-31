import { useEffect, useRef } from "react";
/* maplibre-gl v6 has no default export, and its `Map` would shadow the global
   one used for the marker registry below — hence the alias. */
import { LngLatBounds, Map as MapLibre, Marker, NavigationControl, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
/* Vite emits this as an asset and hands back its served URL — in dev and in
   the production build. See the setWorkerUrl call below for why. */
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import type { SahaEvent } from "../data/events";
import { coordsFor, isPinnable } from "../lib/coords";
import "./MapView.css";

/**
 * MapLibre parses every vector tile in a Web Worker, and it locates that worker
 * relative to its own module URL:
 *
 *   new URL("./maplibre-gl-worker.mjs", import.meta.url)
 *
 * Neither of Vite's two module layouts satisfies that. In dev, maplibre is
 * pre-bundled to node_modules/.vite/deps/maplibre-gl.js, where no sibling
 * worker file exists. In the production build, Rollup cannot statically see
 * through the dev/prod filename branch, so it emits no worker chunk at all.
 * Either way the worker 404s, MapLibre fires "Worker failed to load", and the
 * canvas stays blank — while the DOM markers keep rendering, which makes it
 * look like a styling bug rather than a missing worker.
 *
 * So the URL is supplied explicitly. The worker bundle is self-contained (no
 * static imports), and MapLibre falls back from a module worker to a classic
 * one, so a plain emitted asset is safe. This must run before any Map is
 * constructed — module scope does that, since this file is the lazy chunk.
 */
setWorkerUrl(workerUrl);

/* OpenFreeMap serves OpenMapTiles vector tiles with no key and no signup, and
   "positron" is its light minimal style — the right base for a light product.
   Its attribution ships inside the style, so MapLibre renders it for us. */
const STYLE = "https://tiles.openfreemap.org/styles/positron";

const DELHI: [number, number] = [77.21, 28.61];

interface MapViewProps {
  events: SahaEvent[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Surfaces style/tile failures to the page instead of only the console. */
  onError?: (message: string) => void;
}

export function MapView({ events, selectedId, onSelect, onError }: MapViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const markers = useRef(new Map<string, Marker>());
  /* Held in a ref so changing the handler never tears down and rebuilds every
     marker. Synced in an effect rather than during render — writing a ref
     while rendering is not safe under concurrent React. */
  const select = useRef(onSelect);
  const report = useRef(onError);
  useEffect(() => {
    select.current = onSelect;
    report.current = onError;
  }, [onSelect, onError]);

  /* Create once. */
  useEffect(() => {
    if (!host.current || map.current) return;

    const m = new MapLibre({
      container: host.current,
      style: STYLE,
      center: DELHI,
      zoom: 10.2,
      attributionControl: { compact: true },
    });
    m.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    m.on("click", () => select.current(null));

    /* Style and tile failures are otherwise silent: the canvas just stays
       blank while the DOM markers still render, which looks like "the map is
       broken" with no clue why. Surface it. */
    m.on("error", (e) => {
      const msg = e.error?.message ?? "Unknown map error";
      console.error("MapLibre:", msg, e);
      report.current?.(msg);
    });

    /* MapLibre measures its container once at construction, and `trackResize`
       only watches the window — not the element. This component's stylesheet
       ships in a lazily-loaded chunk, so the container can still be unsized
       when the map is built, leaving a 0x0 canvas that never recovers while
       absolutely-positioned markers keep drawing. A ResizeObserver fixes that
       class of bug outright. */
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(host.current);

    map.current = m;

    /* Copied out now: by the time cleanup runs, the ref may point elsewhere. */
    const registry = markers.current;
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
      registry.clear();
    };
  }, []);

  /* Rebuild markers whenever the filtered set changes. */
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    for (const marker of markers.current.values()) marker.remove();
    markers.current.clear();

    const bounds = new LngLatBounds();
    let placed = 0;

    for (const e of events) {
      if (!isPinnable(e.id)) continue;
      const c = coordsFor(e.id);
      if (!c) continue;

      const el = document.createElement("button");
      el.type = "button";
      /* An area-level hit is drawn as a soft disc, not a point — the event is
         somewhere in there, and the pin must not claim more than that. */
      el.className = `pin pin--${c.precision}`;
      el.setAttribute("aria-label", `${e.title} — ${c.matched}`);
      el.innerHTML = `<span class="pin__dot"></span><span class="pin__label">${e.title}</span>`;
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        select.current(e.id);
      });

      markers.current.set(
        e.id,
        new Marker({ element: el, anchor: "center" })
          .setLngLat([c.lng, c.lat])
          .addTo(m),
      );
      bounds.extend([c.lng, c.lat]);
      placed += 1;
    }

    if (placed > 1) {
      m.fitBounds(bounds, { padding: 72, maxZoom: 13.5, duration: 600 });
    } else if (placed === 1) {
      m.easeTo({ center: bounds.getCenter(), zoom: 13, duration: 600 });
    }
  }, [events]);

  /* Selection is a class toggle, so it never rebuilds the markers. */
  useEffect(() => {
    for (const [id, marker] of markers.current) {
      marker.getElement().classList.toggle("pin--on", id === selectedId);
    }
  }, [selectedId, events]);

  return <div className="map" ref={host} />;
}

export default MapView;
