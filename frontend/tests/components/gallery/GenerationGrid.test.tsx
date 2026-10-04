import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GenerationGrid } from "@/components/gallery/GenerationGrid";
import { buildGenerationSummary } from "../../fixtures/generation";

/** Minimal fake: jsdom has no real IntersectionObserver, so the real one is
 * `undefined` and the component's effect no-ops. Stubbing it lets the tests
 * exercise the scroll-triggered pagination branch instead of skipping it. */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  observedNode: Element | null = null;
  disconnect = vi.fn();

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }

  observe(node: Element) {
    this.observedNode = node;
  }

  unobserve() {}

  intersect() {
    this.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

function baseProps() {
  return {
    items: [buildGenerationSummary({ id: "gen-1" }), buildGenerationSummary({ id: "gen-2" })],
    onOpen: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    onLoadMore: vi.fn(),
  };
}

describe("GenerationGrid", () => {
  afterEach(() => {
    FakeIntersectionObserver.instances = [];
    vi.unstubAllGlobals();
  });

  it("renders one card per item", () => {
    render(<GenerationGrid {...baseProps()} />);

    expect(screen.getAllByRole("img")).toHaveLength(2);
  });

  it("calls onOpen with the clicked generation's id", async () => {
    const onOpen = vi.fn();
    render(<GenerationGrid {...baseProps()} onOpen={onOpen} items={[buildGenerationSummary({ id: "gen-7" })]} />);

    await userEvent.click(screen.getByRole("button"));

    expect(onOpen).toHaveBeenCalledWith("gen-7");
  });

  it("shows the loading-more message while fetching the next page", () => {
    render(<GenerationGrid {...baseProps()} isFetchingNextPage={true} />);

    expect(screen.getByText("Caricamento altre immagini...")).toBeInTheDocument();
  });

  it("hides the loading-more message when not fetching the next page", () => {
    render(<GenerationGrid {...baseProps()} isFetchingNextPage={false} />);

    expect(screen.queryByText("Caricamento altre immagini...")).not.toBeInTheDocument();
  });

  it("observes the sentinel and loads more when it intersects, while hasNextPage is true", () => {
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    const onLoadMore = vi.fn();

    render(<GenerationGrid {...baseProps()} hasNextPage={true} onLoadMore={onLoadMore} />);

    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    const observer = FakeIntersectionObserver.instances[0]!;
    expect(observer.observedNode).not.toBeNull();

    observer.intersect();

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("does not construct an observer when hasNextPage is false", () => {
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    const onLoadMore = vi.fn();

    render(<GenerationGrid {...baseProps()} hasNextPage={false} onLoadMore={onLoadMore} />);

    expect(FakeIntersectionObserver.instances).toHaveLength(0);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("disconnects the observer on unmount", () => {
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);

    const { unmount } = render(<GenerationGrid {...baseProps()} hasNextPage={true} />);
    const observer = FakeIntersectionObserver.instances[0]!;

    unmount();

    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });

  it("still renders the cards and never loads more when IntersectionObserver is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const onLoadMore = vi.fn();

    render(<GenerationGrid {...baseProps()} hasNextPage={true} onLoadMore={onLoadMore} />);

    expect({
      images: screen.getAllByRole("img").length,
      loadMoreCalls: onLoadMore.mock.calls.length,
    }).toEqual({ images: 2, loadMoreCalls: 0 });
  });
});
