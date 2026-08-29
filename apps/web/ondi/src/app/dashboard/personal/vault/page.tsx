import { redirect } from "next/navigation";

// The Vault (encrypted password manager) merged into the Identity Wallet
// page as a "Passwords" tab — this route stays only to redirect old
// bookmarks/links rather than 404ing them.
export default function VaultRedirectPage() {
  redirect("/dashboard/personal/wallet");
}
