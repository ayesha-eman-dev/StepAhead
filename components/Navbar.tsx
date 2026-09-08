import Link from "next/link";

/**
 * Shared brand header rendered at the top of every page.
 * `rightSlot` accepts any nav element (link, badge, etc.) for the right side.
 * `maxWidth` lets callers match their page's content-width constraint.
 */
export default function Navbar({
  rightSlot,
  maxWidth = "max-w-5xl",
}: {
  rightSlot?: React.ReactNode;
  maxWidth?: string;
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 backdrop-blur-sm">
      <div className={`mx-auto flex ${maxWidth} items-center justify-between px-6 py-4`}>
        {/* Brand */}
        <Link
          href="/"
          className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/favicon.ico"
            alt=""
            width={20}
            height={20}
            className="w-5 h-5 rounded-sm"
            aria-hidden="true"
          />
          StepAhead
        </Link>
        {/* Right-hand slot */}
        {rightSlot && <div className="flex items-center gap-4">{rightSlot}</div>}
      </div>
    </header>
  );
}
