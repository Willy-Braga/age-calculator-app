export function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="brand-gradient grid size-8 shrink-0 place-items-center rounded-lg shadow-md shadow-primary/30">
        <svg viewBox="0 0 32 32" className="size-5" aria-hidden>
          <path d="M9 17.5 15 9h8v8l-8.5 6z" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" />
          <circle cx="19.5" cy="12.5" r="1.7" fill="#fff" />
        </svg>
      </div>
      {!collapsed && (
        <span className="text-[15px] font-semibold tracking-tight">
          OfertaHub <span className="brand-text">AI</span>
        </span>
      )}
    </div>
  );
}
