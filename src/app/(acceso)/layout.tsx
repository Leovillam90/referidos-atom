import Link from "next/link";

export default function LayoutAcceso({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-10">
      <Link href="/" className="text-lg font-semibold tracking-tight">
        Referidos ATOM
      </Link>
      {children}
    </main>
  );
}
