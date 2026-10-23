export function PageHeader({
  title,
  subtitle,
  badge,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Small chip next to the title (e.g. the "Super Admin" role pill). */
  badge?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 animate-fade-up">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="font-display text-[22px] font-semibold tracking-[-0.02em] md:text-2xl">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="mt-1 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
