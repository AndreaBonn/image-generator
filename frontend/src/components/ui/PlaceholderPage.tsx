interface PlaceholderPageProps {
  title: string;
}

/** Honest placeholder: a title and "in arrivo", no fake controls. */
export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <div className="flex flex-col items-start gap-2">
      <h1 className="text-xl font-semibold text-ink">{title}</h1>
      <p className="text-ink-muted">In arrivo.</p>
    </div>
  );
}
