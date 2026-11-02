import { useRouter } from 'expo-router';

import { SignInForm } from '@/features/auth/auth-forms';

export default function SignInRoute() {
  const router = useRouter();
  return (
    <SignInForm
      onDone={() => router.back()}
      onCreateAccount={() => router.replace('/auth/sign-up')}
      onBack={() => router.back()}
    />
  );
}
