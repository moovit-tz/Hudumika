import EnterpriseGuard from "./EnterpriseGuard";

export default function EnterpriseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <EnterpriseGuard>{children}</EnterpriseGuard>;
}
