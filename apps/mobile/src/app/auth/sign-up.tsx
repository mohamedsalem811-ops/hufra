import { useRouter } from 'expo-router';

import { SignUpForm } from '@/features/auth/auth-forms';

export default function SignUpRoute() {
  const router = useRouter();
  return (
    <SignUpForm onDone={() => router.back()} onSignIn={() => router.replace('/auth/sign-in')} onBack={() => router.back()} />
  );
}
