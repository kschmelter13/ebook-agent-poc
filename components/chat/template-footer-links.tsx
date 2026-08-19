import type { ReactNode } from "react";

export function TemplateFooterLinks() {
  return (
    <footer className="flex shrink-0 items-center justify-center gap-1.5 px-2 text-center text-[11px] leading-4 text-muted-foreground/55 sm:text-xs">
      <span>Built with</span>
      <FooterLink href="https://eve.dev">eve</FooterLink>
      <span>and</span>
      <FooterLink href="https://vercel.com">Vercel</FooterLink>
    </footer>
  );
}

function FooterLink({ children, href }: { readonly children: ReactNode; readonly href: string }) {
  return (
    <a
      className="underline underline-offset-4 transition-colors hover:text-foreground"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {children}
    </a>
  );
}
