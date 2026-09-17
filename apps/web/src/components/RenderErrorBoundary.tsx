import { Component, type ReactNode } from "react";

export type RenderErrorFallback = {
  readonly error: unknown;
  readonly reset: () => void;
};

interface RenderErrorBoundaryProps {
  readonly children: ReactNode;
  readonly fallback: ReactNode | ((args: RenderErrorFallback) => ReactNode);
  readonly resetKeys?: ReadonlyArray<unknown>;
}

interface RenderErrorBoundaryState {
  readonly failed: boolean;
  readonly error: unknown;
  readonly resetKeys?: ReadonlyArray<unknown> | undefined;
}

export class RenderErrorBoundary extends Component<
  RenderErrorBoundaryProps,
  RenderErrorBoundaryState
> {
  override state: RenderErrorBoundaryState = {
    failed: false,
    error: null,
    resetKeys: this.props.resetKeys,
  };

  // Retry changed inputs without remounting healthy children or their controls.
  static getDerivedStateFromProps(
    { resetKeys }: RenderErrorBoundaryProps,
    state: RenderErrorBoundaryState
  ) {
    if (
      resetKeys?.length !== state.resetKeys?.length ||
      resetKeys?.some((key, index) => !Object.is(key, state.resetKeys?.[index]))
    ) {
      return { failed: false, error: null, resetKeys };
    }
    return null;
  }

  static getDerivedStateFromError(error: unknown) {
    return { failed: true, error };
  }

  reset = () => {
    this.setState({ failed: false, error: null });
  };

  override render() {
    if (!this.state.failed) return this.props.children;
    const { fallback } = this.props;
    if (typeof fallback === "function") {
      return fallback({ error: this.state.error, reset: this.reset });
    }
    return fallback;
  }
}
