import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Authorize access",
};

export default function AuthorizeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
