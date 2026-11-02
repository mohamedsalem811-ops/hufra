import { useRouter } from 'expo-router';

import { Welcome } from '@/screens/onboarding/welcome';

export default function WelcomeRoute() {
  const router = useRouter();
  return <Welcome onStart={() => router.push('/onboarding/location')} />;
}
