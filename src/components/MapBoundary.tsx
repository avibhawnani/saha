import { Component, type ErrorInfo, type ReactNode } from "react";
import "./MapBoundary.css";

/**
 * MapLibre needs WebGL. On a machine without it — a locked-down laptop, a
 * VM, a browser with hardware acceleration off — constructing the map throws,
 * and an uncaught throw in render blanks the entire page. For something being
 * demonstrated on unknown hardware that is the worst possible failure, so the
 * map is isolated behind a boundary and degrades to the list instead.
 */
interface State {
  error: Error | null;
}

export class MapBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Map failed to render:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mapfail">
          <p className="mapfail__title">The map could not start</p>
          <p className="mapfail__body">
            This usually means WebGL is unavailable in this browser. Every event is still listed
            below, with the same detail.
          </p>
          <a className="btn btn--secondary btn--md" href="#tonight">
            Browse the listings
          </a>
          <p className="mapfail__why">{this.state.error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
