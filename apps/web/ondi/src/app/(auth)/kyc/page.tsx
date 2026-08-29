import { permanentRedirect } from 'next/navigation';

export default function KYCPage() {
  permanentRedirect('/register/personal/kyc');
}